import os
import logging
from datetime import datetime
from typing import Dict, Any, AsyncGenerator
from dotenv import load_dotenv, find_dotenv

from .openai_client import OpenAIClient

load_dotenv(find_dotenv())

logger = logging.getLogger(__name__)

_api_key = os.getenv('OPENAI_API_KEY', '')
if not _api_key:
    logger.warning("⚠️  OPENAI_API_KEY env var not set — API calls will fail.")

client = OpenAIClient(
    model_id=os.getenv('OPENAI_MODEL_ID', 'gpt-4.1-mini'),
    api_key=_api_key,
)


async def stream_resume_processing(extracted_text: str) -> AsyncGenerator[Dict[str, Any], None]:
    """
    Stream all agent pipeline events (start, complete, final_data, error).
    """
    logger.info('Starting resume processing...')
    try:
        from .resume_agents import MultiAgentResumeProcessor
        processor = MultiAgentResumeProcessor(client)
        async for event in processor.process_resume_with_agents(extracted_text):
            yield event
    except Exception as error:
        logger.error(f'❌ Resume processing error: {error}')
        yield {
            'type': 'error',
            'message': f'Resume processing error: {error}',
            'timestamp': datetime.now().isoformat(),
        }
