import os
import logging
from datetime import datetime
from typing import Dict, Any, AsyncGenerator
from dotenv import load_dotenv, find_dotenv

from .openai_client import OpenAIClient
from .chunk_resume import chunk_resume_from_bold_headings

# Load .env from the nearest .env file found by traversing parent directories
load_dotenv(find_dotenv())

logger = logging.getLogger(__name__)

# ─────────────────────────────────────────────────────────────────────────────
# CLIENT INITIALISATION
# ─────────────────────────────────────────────────────────────────────────────

_api_key = os.getenv('OPENAI_API_KEY', '')
if not _api_key:
    logger.warning("⚠️  OPENAI_API_KEY env var not set — API calls will fail.")

client = OpenAIClient(
    model_id=os.getenv('OPENAI_MODEL_ID', 'gpt-5.0'),
    api_key=_api_key,
)


# ─────────────────────────────────────────────────────────────────────────────
# STREAM PROCESSING
# ─────────────────────────────────────────────────────────────────────────────

async def stream_resume_processing(extracted_text: str) -> AsyncGenerator[Dict[str, Any], None]:
    """
    Simple resume processing - just loading and final result.
    """
    logger.info('Starting resume processing...')

    try:
        from .resume_agents import MultiAgentResumeProcessor

        processor = MultiAgentResumeProcessor(client)

        async for update in processor.process_resume_with_agents(extracted_text):
            if update.get('type') == 'final_data':
                yield update
                return

    except Exception as error:
        logger.error(f'❌ Resume processing error: {error}')
        yield {
            'type': 'error',
            'message': f'Resume processing error: {error}',
            'timestamp': datetime.now().isoformat(),
        }
