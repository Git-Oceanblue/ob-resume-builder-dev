"""
Token Logger Utility for Amazon Bedrock API calls.

Migrated from OpenAI response objects to Bedrock JSON response dicts.

Bedrock usage fields:
    response["usage"]["inputTokens"]   – equivalent to prompt_tokens
    response["usage"]["outputTokens"]  – equivalent to completion_tokens
    response["usage"]["totalTokens"]   – equivalent to total_tokens
"""

import logging
from datetime import datetime
from typing import Any, Dict, Optional

logger = logging.getLogger(__name__)


def calculate_cost(input_tokens: int, output_tokens: int, model: str) -> float:
    """
    Calculate approximate cost of a Bedrock API call based on token counts.

    Args:
        input_tokens:  Number of input (prompt) tokens.
        output_tokens: Number of output (completion) tokens.
        model:         The Bedrock model ID string.

    Returns:
        Estimated cost in USD.
    """
    pricing: Dict[str, Dict[str, float]] = {
        'openai.gpt-oss-20b-1:0': {
            'input':  0.00015,
            'output': 0.0006,
        },
    }

    model_pricing = pricing.get(model, pricing['openai.gpt-oss-20b-1:0'])
    input_cost  = (input_tokens  / 1000) * model_pricing['input']
    output_cost = (output_tokens / 1000) * model_pricing['output']
    return input_cost + output_cost


def log_token_usage(
    response: Any,
    model: str,
    start_time: datetime,
    operation: str = 'Bedrock API Call',
) -> Dict[str, Any]:
    """
    Log token usage from a Bedrock InvokeModel JSON response dict.

    Bedrock returns usage as:
        {"usage": {"inputTokens": N, "outputTokens": N, "totalTokens": N}}
    """
    empty = {
        'promptTokens':     0,
        'completionTokens': 0,
        'totalTokens':      0,
        'duration':         0,
        'cost':             0,
    }

    if not isinstance(response, dict):
        logger.warning('❌ Unable to log token usage: response is not a dict')
        return empty

    usage = response.get('usage')
    if not usage:
        logger.warning('❌ Unable to log token usage: no usage data in response')
        return empty

    end_time      = datetime.now()
    call_duration = (end_time - start_time).total_seconds()

    # Accept both response shapes:
    #   Native Bedrock:      inputTokens / outputTokens / totalTokens
    #   OpenAI-compat layer: prompt_tokens / completion_tokens / total_tokens
    input_tokens  = (usage.get('inputTokens')     or usage.get('prompt_tokens')     or 0)
    output_tokens = (usage.get('outputTokens')    or usage.get('completion_tokens') or 0)
    total_tokens  = (usage.get('totalTokens')     or usage.get('total_tokens')
                     or input_tokens + output_tokens)
    cost          = calculate_cost(input_tokens, output_tokens, model)

    logger.info(
        f"📊 {operation} | "
        f"Input: {input_tokens} | Output: {output_tokens} | "
        f"Total: {total_tokens} | Duration: {call_duration:.2f}s | "
        f"Cost: ${cost:.6f}"
    )

    return {
        'promptTokens':     input_tokens,
        'completionTokens': output_tokens,
        'totalTokens':      total_tokens,
        'duration':         call_duration,
        'cost':             cost,
    }


def start_timing() -> datetime:
    """
    Start timing a Bedrock API call.

    Returns:
        The current datetime as the start timestamp.
    """
    return datetime.now()


def log_cache_analysis(
    response: Any,
    section_name: Optional[str] = None,
) -> None:
    """
    Log basic token usage from a Bedrock InvokeModel JSON response dict.

    Note: Bedrock does not expose a prompt-cache hit rate the way OpenAI does.
    This function logs input/output token counts for observability instead.
    """
    if not isinstance(response, dict):
        return

    usage = response.get('usage')
    if not usage:
        return

    input_tokens  = usage.get('inputTokens',  0)
    output_tokens = usage.get('outputTokens', 0)
    total_tokens  = usage.get('totalTokens',  input_tokens + output_tokens)
    context       = f" ({section_name})" if section_name else ""

    logger.info(f"📈 TOKEN USAGE{context}:")
    logger.info(f"   Input Tokens:  {input_tokens}")
    logger.info(f"   Output Tokens: {output_tokens}")
    logger.info(f"   Total Tokens:  {total_tokens}")
