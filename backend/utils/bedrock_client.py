"""
AWS Bedrock InvokeModel client using boto3 (IAM-based authentication).

Auth:     IAM role attached to the Lambda execution role.
          No API key is needed — boto3 signs every request with SigV4
          automatically using the credentials in the environment
          (Lambda role, ~/.aws/credentials, or EC2 instance profile).

Model:    Configured via BEDROCK_MODEL_ID env var.
Endpoint: boto3 bedrock-runtime client → invoke_model()
"""

import asyncio
import json
import logging
from typing import Any, Dict, List

import boto3
from botocore.exceptions import ClientError

logger = logging.getLogger(__name__)


class BedrockClient:
    """
    Async-friendly Bedrock InvokeModel client backed by boto3.

    Agents call  await client.invoke(messages=[...])  and receive a raw
    response dict.  Pass the dict to  BedrockClient.extract_content()
    to get the plain-text / JSON string the model produced.
    """

    def __init__(self, model_id: str, region: str) -> None:
        self.model_id = model_id
        self.region   = region
        self._client  = boto3.client("bedrock-runtime", region_name=region)

    # ─────────────────────────────────────────────────────────────────────────
    # Public API
    # ─────────────────────────────────────────────────────────────────────────

    async def invoke(
        self,
        messages: List[Dict[str, Any]],
        max_tokens: int = 16384,
    ) -> Dict[str, Any]:
        """
        Call Bedrock InvokeModel asynchronously.

        boto3 is synchronous, so the blocking call is offloaded to the
        default thread-pool executor to avoid blocking the event loop.

        Request body:
            { "messages": [...], "max_tokens": N }

        Returns the raw parsed-JSON response dict.
        """
        loop = asyncio.get_event_loop()
        return await loop.run_in_executor(
            None, self._invoke_sync, messages, max_tokens
        )

    def _invoke_sync(
        self,
        messages: List[Dict[str, Any]],
        max_tokens: int,
    ) -> Dict[str, Any]:
        body = json.dumps({"messages": messages, "max_tokens": max_tokens})
        logger.debug("Bedrock invoke → modelId=%s", self.model_id)
        try:
            response = self._client.invoke_model(
                modelId     = self.model_id,
                contentType = "application/json",
                accept      = "application/json",
                body        = body,
            )
        except ClientError as exc:
            code = exc.response["Error"]["Code"]
            msg  = exc.response["Error"]["Message"]
            raise RuntimeError(f"Bedrock ClientError [{code}]: {msg}") from exc

        data = json.loads(response["body"].read())
        logger.info(
            "Bedrock raw response keys: %s | raw[:600]: %s",
            list(data.keys()),
            json.dumps(data)[:600],
        )
        return data

    @staticmethod
    def extract_content(response: Dict[str, Any]) -> str:
        """
        Extract the model's text output from any known Bedrock response shape.

        Shapes tried (in order):
          1. {"message": {"content": "..."}}            – Bedrock chat models
          2. {"message": {"content": [{"text":"..."}]}} – content-list variant
          3. {"outputText": "..."}                      – Bedrock text models
          4. {"choices": [{"message": {"content":"..."}}]} – OpenAI-compat layer
          5. {"choices": [{"text": "..."}]}             – completion variant
          6. {"content": "..."}                         – flat string
          7. {"content": [{"text": "..."}]}             – flat list
          8. Any top-level string value                 – last-resort scan
        """
        # ── Shape 1 & 2: {"message": {"content": ...}} ───────────────────────
        if "message" in response:
            msg = response["message"]
            if isinstance(msg, dict):
                raw_content = msg.get("content", "")
                if isinstance(raw_content, str) and raw_content.strip():
                    return raw_content.strip()
                if isinstance(raw_content, list):
                    texts = [
                        c.get("text", "") for c in raw_content
                        if isinstance(c, dict)
                    ]
                    joined = "\n".join(t for t in texts if t).strip()
                    if joined:
                        return joined

        # ── Shape 3: {"outputText": "..."} ───────────────────────────────────
        if "outputText" in response:
            out = response["outputText"]
            if isinstance(out, str) and out.strip():
                return out.strip()

        # ── Shape 4 & 5: {"choices": [...]} ──────────────────────────────────
        choices = response.get("choices") or []
        if choices:
            choice = choices[0]
            msg = choice.get("message", {})
            content = msg.get("content", "") if isinstance(msg, dict) else ""
            if isinstance(content, str) and content.strip():
                return content.strip()
            text = choice.get("text", "")
            if isinstance(text, str) and text.strip():
                return text.strip()

        # ── Shape 6 & 7: top-level "content" field ───────────────────────────
        top_content = response.get("content")
        if isinstance(top_content, str) and top_content.strip():
            return top_content.strip()
        if isinstance(top_content, list) and top_content:
            first = top_content[0]
            if isinstance(first, dict):
                text = first.get("text", "")
                if isinstance(text, str) and text.strip():
                    return text.strip()

        # ── Shape 8: scan all top-level string values ─────────────────────────
        for key, val in response.items():
            if key in ("usage", "stop_reason", "id", "model", "type"):
                continue
            if isinstance(val, str) and val.strip():
                logger.warning(
                    "extract_content: using fallback key '%s'. "
                    "Full response keys: %s",
                    key, list(response.keys()),
                )
                return val.strip()

        raise ValueError(
            f"Bedrock returned no recognisable text content. "
            f"Response keys: {list(response.keys())}. "
            f"Raw: {json.dumps(response)[:400]}"
        )

    async def close(self) -> None:
        pass  # boto3 manages its own connection pool
