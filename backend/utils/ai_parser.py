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
# Auth is handled by the IAM role attached to this process (Lambda execution
# role in production, ~/.aws/credentials or AWS_* env vars locally).
# No API key is required — boto3 signs requests with SigV4 automatically.
# ─────────────────────────────────────────────────────────────────────────────

client = BedrockClient(
    model_id=os.getenv('BEDROCK_MODEL_ID', 'openai.gpt-oss-20b-1:0'),
    region=os.getenv('BEDROCK_REGION', 'us-east-2'),
)
logger.info("✅ BedrockClient initialised (IAM auth) — model=%s region=%s",
            client.model_id, client.region)


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
