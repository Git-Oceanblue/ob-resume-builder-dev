"""
Token Logger Utility for OpenAI API calls.

OpenAI usage fields:
    response["usage"]["prompt_tokens"]     – input tokens
    response["usage"]["completion_tokens"] – output tokens
    response["usage"]["total_tokens"]      – total tokens
"""

import logging
from datetime import datetime
from typing import Any, Dict, Optional

logger = logging.getLogger(__name__)


def calculate_cost(input_tokens: int, output_tokens: int, model: str) -> float:
    """
    Calculate approximate cost of an OpenAI API call based on token counts.

    Args:
        input_tokens:  Number of input (prompt) tokens.
        output_tokens: Number of output (completion) tokens.
        model:         The OpenAI model ID string.

    Returns:
        Estimated cost in USD.
    """
    pricing: Dict[str, Dict[str, float]] = {
        'gpt-4o-mini': {
            'input':  0.00015,
            'output': 0.0006,
        },
        'gpt-4o': {
            'input':  0.005,
            'output': 0.015,
        },
        'gpt-4.1-mini': {
            'input':  0.0004,
            'output': 0.0016,
        },
    }

    model_pricing = pricing.get(model, pricing['gpt-4.1-mini'])
    input_cost  = (input_tokens  / 1000) * model_pricing['input']
    output_cost = (output_tokens / 1000) * model_pricing['output']
    return input_cost + output_cost


def log_token_usage(
    response: Any,
    model: str,
    start_time: datetime,
    operation: str = 'OpenAI API Call',
) -> Dict[str, Any]:
    """
    Log token usage from an OpenAI chat completions response dict.

    Expected shape:
        {"usage": {"prompt_tokens": N, "completion_tokens": N, "total_tokens": N}}
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

    input_tokens  = usage.get('prompt_tokens',     0)
    output_tokens = usage.get('completion_tokens', 0)
    total_tokens  = usage.get('total_tokens',      input_tokens + output_tokens)
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
    """Start timing an API call."""
    return datetime.now()


def log_cache_analysis(
    response: Any,
    section_name: Optional[str] = None,
) -> None:
    """
    Log basic token usage from an OpenAI response dict.
    """
    if not isinstance(response, dict):
        return

    usage = response.get('usage')
    if not usage:
        return

    input_tokens  = usage.get('prompt_tokens',     0)
    output_tokens = usage.get('completion_tokens', 0)
    total_tokens  = usage.get('total_tokens',      input_tokens + output_tokens)
    context       = f" ({section_name})" if section_name else ""

    logger.info(f"📈 TOKEN USAGE{context}:")
    logger.info(f"   Input Tokens:  {input_tokens}")
    logger.info(f"   Output Tokens: {output_tokens}")
    logger.info(f"   Total Tokens:  {total_tokens}")
