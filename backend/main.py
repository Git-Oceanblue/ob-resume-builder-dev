"""
FastAPI Resume Builder Backend - AWS Lambda Version
"""

from fastapi import FastAPI, File, UploadFile, HTTPException, Body
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse, JSONResponse
import os
import uuid
import tempfile
from pathlib import Path
import logging
import json
from datetime import datetime

from utils.file_parser import extract_text_from_file
from utils.ai_parser import stream_resume_processing

logging.basicConfig(
    level=logging.INFO,
    format='%(levelname)s - %(name)s - %(message)s'
)
logger = logging.getLogger(__name__)

app = FastAPI(title="OceanBlue Resume Automation API", version="2.0.0")

# CORS: only add in local dev; Lambda Function URL handles it in production.
if not os.getenv("AWS_LAMBDA_FUNCTION_NAME"):
    app.add_middleware(
        CORSMiddleware,
        allow_origins=["http://localhost:3000"],
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

# AWS services are optional; skip gracefully when not configured
_AWS_ENABLED = bool(os.getenv('RESUMES_S3_BUCKET') or os.getenv('DYNAMODB_CACHE_TABLE'))


def _get_aws():
    if not _AWS_ENABLED:
        return None
    try:
        from utils.aws_services import (
            compute_file_hash,
            get_cached_result,
            save_to_cache,
            upload_original_to_s3,
            save_processed_resume,
            list_saved_resumes,
            get_presigned_url,
        )
        return {
            'compute_file_hash':     compute_file_hash,
            'get_cached_result':     get_cached_result,
            'save_to_cache':         save_to_cache,
            'upload_original_to_s3': upload_original_to_s3,
            'save_processed_resume': save_processed_resume,
            'list_saved_resumes':    list_saved_resumes,
            'get_presigned_url':     get_presigned_url,
        }
    except Exception as exc:
        logger.warning(f"AWS services unavailable: {exc}")
        return None


@app.get("/")
async def root():
    return {"message": "OceanBlue Resume Automation API v2.0", "awsEnabled": _AWS_ENABLED}


# ── Main processing endpoint ─────────────────────────────────────────────────

@app.post("/api/stream-resume-processing")
async def stream_resume_processing_endpoint(file: UploadFile = File(...)):
    """Stream resume processing with per-agent progress events via SSE."""
    try:
        logger.info(f"Processing file: {file.filename} ({file.content_type})")

        suffix  = Path(file.filename).suffix
        content = await file.read()
        if not content:
            raise HTTPException(status_code=400, detail="File is empty")
        logger.info(f"✅ File read: {len(content)} bytes")

        # DynamoDB cache look-up
        aws       = _get_aws()
        file_hash = None
        resume_id = str(uuid.uuid4())[:8]
        if aws:
            file_hash = aws['compute_file_hash'](content)
            cached    = aws['get_cached_result'](file_hash)
            if cached:
                logger.info("✅ Returning cached result")
                async def _cached_stream():
                    yield f"data: {json.dumps({'type': 'cache_hit', 'message': 'Returning cached result'})}\n\n"
                    yield f"data: {json.dumps({'type': 'final_data', 'data': cached, 'fromCache': True, 'timestamp': datetime.now().isoformat()})}\n\n"
                    yield "data: [DONE]\n\n"
                return StreamingResponse(
                    _cached_stream(),
                    media_type="text/event-stream",
                    headers={"Cache-Control": "no-cache", "Connection": "keep-alive", "X-Accel-Buffering": "no"},
                )

            # Upload original to S3
            try:
                aws['upload_original_to_s3'](content, file.filename, resume_id)
            except Exception as s3_err:
                logger.warning(f"S3 upload skipped: {s3_err}")

        # Write to temp file for extraction
        temp_file_path = None
        with tempfile.NamedTemporaryFile(delete=False, suffix=suffix) as tmp:
            temp_file_path = tmp.name
            tmp.write(content)

        try:
            extracted_text = extract_text_from_file(temp_file_path)
            logger.info(f"✅ Text extracted: {len(extracted_text)} chars")

            final_data_holder: list = []

            async def generate_stream():
                try:
                    async for chunk in stream_resume_processing(extracted_text):
                        if chunk.get('type') == 'final_data':
                            final_data_holder.append(chunk.get('data', {}))
                        yield f"data: {json.dumps(chunk, ensure_ascii=False)}\n\n"
                    yield "data: [DONE]\n\n"

                    # Save to DynamoDB cache after stream completes
                    if aws and final_data_holder and file_hash:
                        try:
                            aws['save_to_cache'](file_hash, final_data_holder[0])
                        except Exception as cache_err:
                            logger.warning(f"Cache save skipped: {cache_err}")

                except Exception as stream_error:
                    logger.error(f"❌ Streaming error: {stream_error}")
                    yield f"data: {json.dumps({'type': 'error', 'message': str(stream_error), 'timestamp': datetime.now().isoformat()})}\n\n"

            return StreamingResponse(
                generate_stream(),
                media_type="text/event-stream",
                headers={"Cache-Control": "no-cache", "Connection": "keep-alive", "X-Accel-Buffering": "no"},
            )
        finally:
            if temp_file_path:
                try:
                    os.unlink(temp_file_path)
                except Exception:
                    pass

    except Exception as e:
        logger.error(f"❌ Processing error: {e}")
        raise HTTPException(status_code=500, detail=str(e))


# ── Save to S3 endpoint ──────────────────────────────────────────────────────

@app.post("/api/save-resume")
async def save_resume_to_s3(payload: dict = Body(...)):
    """Save processed resume JSON to S3."""
    aws = _get_aws()
    if not aws:
        raise HTTPException(status_code=503, detail="AWS S3 not configured")

    resume_data    = payload.get('resumeData', {})
    target_state   = payload.get('targetState', '')
    candidate_name = resume_data.get('name', 'unknown')
    resume_id      = payload.get('resumeId', str(uuid.uuid4())[:8])

    try:
        key = aws['save_processed_resume'](
            resume_data=resume_data,
            resume_id=resume_id,
            candidate_name=candidate_name,
            target_state=target_state,
        )
        presigned = aws['get_presigned_url'](key)
        return JSONResponse({
            'success':      True,
            'key':          key,
            'resumeId':     resume_id,
            'downloadUrl':  presigned,
            'savedAt':      datetime.now().isoformat(),
        })
    except Exception as exc:
        logger.error(f"S3 save failed: {exc}")
        raise HTTPException(status_code=500, detail=str(exc))


# ── List saved resumes endpoint ───────────────────────────────────────────────

@app.get("/api/resumes")
async def list_resumes():
    """List all saved resumes from S3."""
    aws = _get_aws()
    if not aws:
        return JSONResponse({'resumes': [], 'awsEnabled': False})
    try:
        resumes = aws['list_saved_resumes']()
        return JSONResponse({'resumes': resumes, 'awsEnabled': True})
    except Exception as exc:
        logger.error(f"List resumes failed: {exc}")
        raise HTTPException(status_code=500, detail=str(exc))
