import os
import logging
from datetime import datetime
from typing import Dict, Any, AsyncGenerator
from dotenv import load_dotenv, find_dotenv

from .bedrock_client import BedrockClient
from .chunk_resume import chunk_resume_from_bold_headings

# Load .env from the nearest .env file found by traversing parent directories
load_dotenv(find_dotenv())

logger = logging.getLogger(__name__)

# ─────────────────────────────────────────────────────────────────────────────
# CLIENT INITIALISATION
# ─────────────────────────────────────────────────────────────────────────────

api_key = os.getenv('BEDROCK_API_KEY')
if not api_key:
    logger.error("❌ BEDROCK_API_KEY environment variable is not set")
    raise ValueError("BEDROCK_API_KEY environment variable is not set")
logger.info(f"✅ Bedrock API key found: {api_key[:10]}...")

client = BedrockClient(
    api_key=api_key,
    base_url=os.getenv('BEDROCK_BASE_URL', 'https://bedrock-runtime.us-east-2.amazonaws.com'),
    model_id=os.getenv('BEDROCK_MODEL_ID', 'openai.gpt-oss-20b-1:0'),
    region=os.getenv('BEDROCK_REGION', 'us-east-2'),
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
