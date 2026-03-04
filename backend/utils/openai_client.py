"""
OpenAI client wrapper for resume processing.
Uses the openai SDK with gpt-4o-mini.
"""

import asyncio
import logging
from typing import Any, Dict, List

from openai import AsyncOpenAI

logger = logging.getLogger(__name__)


class OpenAIClient:
    """Async wrapper around the OpenAI chat completions API."""

    def __init__(self, model_id: str, api_key: str):
        self.model_id = model_id
        self.api_key = api_key
        self._client = AsyncOpenAI(api_key=api_key)
        logger.info("✅ OpenAIClient initialised — model=%s", model_id)

    async def invoke(
        self,
        messages: List[Dict[str, str]],
        max_tokens: int = 4096,
    ) -> Dict[str, Any]:
        """
        Call the OpenAI chat completions endpoint and return a normalised
        response dict that mirrors the shape expected by token_logger and
        resume_agents:

            {
                "content": [{"text": "<model output>"}],
                "usage": {
                    "prompt_tokens": N,
                    "completion_tokens": N,
                    "total_tokens": N,
                }
            }
        """
        response = await self._client.chat.completions.create(
            model=self.model_id,
            messages=messages,
            max_tokens=max_tokens,
        )

        text = response.choices[0].message.content or ""
        usage = response.usage

        return {
            "content": [{"text": text}],
            "usage": {
                "prompt_tokens":     usage.prompt_tokens,
                "completion_tokens": usage.completion_tokens,
                "total_tokens":      usage.total_tokens,
            },
        }

    @staticmethod
    def extract_content(response: Dict[str, Any]) -> str:
        """Extract the text content from the normalised response dict."""
        content = response.get("content", [])
        if content and isinstance(content, list):
            return content[0].get("text", "")
        return ""

    async def close(self) -> None:
        """No-op — AsyncOpenAI manages its own connection pool."""
        pass
