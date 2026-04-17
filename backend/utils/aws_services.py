"""
AWS S3 and DynamoDB services for resume storage and caching.
"""
import hashlib
import json
import logging
import os
from datetime import datetime, timedelta
from typing import Any, Dict, List, Optional

logger = logging.getLogger(__name__)

RESUMES_BUCKET  = os.getenv('RESUMES_S3_BUCKET', 'ob-resumes-dev')
CACHE_TABLE     = os.getenv('DYNAMODB_CACHE_TABLE', 'ob-resume-cache-dev')
AWS_REGION      = os.getenv('AWS_DEFAULT_REGION', os.getenv('AWS_REGION', 'us-east-2'))
CACHE_TTL_HOURS = int(os.getenv('CACHE_TTL_HOURS', '24'))

_s3_client = None
_ddb_resource = None


def _s3():
    global _s3_client
    if _s3_client is None:
        import boto3
        _s3_client = boto3.client('s3', region_name=AWS_REGION)
    return _s3_client


def _ddb():
    global _ddb_resource
    if _ddb_resource is None:
        import boto3
        _ddb_resource = boto3.resource('dynamodb', region_name=AWS_REGION)
    return _ddb_resource


def compute_file_hash(content: bytes) -> str:
    return hashlib.sha256(content).hexdigest()[:20]


# ── DynamoDB cache ────────────────────────────────────────────────────────────

def get_cached_result(file_hash: str) -> Optional[Dict[str, Any]]:
    """Return cached resume data from DynamoDB, or None on miss/error."""
    try:
        table = _ddb().Table(CACHE_TABLE)
        resp  = table.get_item(Key={'fileHash': file_hash})
        item  = resp.get('Item')
        if item:
            expires_at = int(item.get('expiresAt', 0))
            if expires_at > int(datetime.now().timestamp()):
                logger.info(f"✅ DynamoDB cache HIT  [{file_hash[:8]}...]")
                return json.loads(item['resumeData'])
            logger.info(f"⏰ DynamoDB cache EXPIRED [{file_hash[:8]}...]")
    except Exception as exc:
        logger.warning(f"DynamoDB cache lookup skipped: {exc}")
    return None


def save_to_cache(file_hash: str, resume_data: Dict[str, Any]) -> None:
    """Write processed resume data to DynamoDB with a TTL."""
    try:
        table      = _ddb().Table(CACHE_TABLE)
        expires_at = int((datetime.now() + timedelta(hours=CACHE_TTL_HOURS)).timestamp())
        table.put_item(Item={
            'fileHash':   file_hash,
            'resumeData': json.dumps(resume_data, default=str),
            'expiresAt':  expires_at,
            'createdAt':  datetime.now().isoformat(),
        })
        logger.info(f"✅ Cached result in DynamoDB [{file_hash[:8]}...]")
    except Exception as exc:
        logger.error(f"DynamoDB cache write failed: {exc}")


# ── S3 operations ─────────────────────────────────────────────────────────────

def upload_original_to_s3(content: bytes, filename: str, resume_id: str) -> str:
    """Upload the original resume file to S3; return the S3 key."""
    key = f"originals/{resume_id}/{filename}"
    _s3().put_object(
        Bucket=RESUMES_BUCKET,
        Key=key,
        Body=content,
        ContentType='application/octet-stream',
        Metadata={'resumeId': resume_id, 'originalFilename': filename},
    )
    logger.info(f"✅ Uploaded original → s3://{RESUMES_BUCKET}/{key}")
    return key


def save_processed_resume(
    resume_data:    Dict[str, Any],
    resume_id:      str,
    candidate_name: str = 'unknown',
    target_state:   str = '',
) -> str:
    """Save processed resume JSON to S3; return the S3 key."""
    safe_name = ''.join(c if c.isalnum() or c in '_-' else '_' for c in candidate_name)
    key = f"processed/{resume_id}/{safe_name}_resume.json"
    payload = {
        'resumeId':    resume_id,
        'processedAt': datetime.now().isoformat(),
        'targetState': target_state,
        'resumeData':  resume_data,
    }
    _s3().put_object(
        Bucket=RESUMES_BUCKET,
        Key=key,
        Body=json.dumps(payload, indent=2, default=str).encode('utf-8'),
        ContentType='application/json',
    )
    logger.info(f"✅ Saved processed resume → s3://{RESUMES_BUCKET}/{key}")
    return key


def list_saved_resumes() -> List[Dict[str, Any]]:
    """List all processed resumes stored in S3."""
    try:
        paginator = _s3().get_paginator('list_objects_v2')
        resumes: List[Dict[str, Any]] = []
        for page in paginator.paginate(Bucket=RESUMES_BUCKET, Prefix='processed/'):
            for obj in page.get('Contents', []):
                parts = obj['Key'].split('/')          # processed / {id} / {name}.json
                resume_id = parts[1] if len(parts) >= 3 else ''
                raw_name  = parts[2] if len(parts) >= 3 else obj['Key']
                name = raw_name.replace('_resume.json', '').replace('_', ' ').strip()
                resumes.append({
                    'key':           obj['Key'],
                    'resumeId':      resume_id,
                    'candidateName': name,
                    'lastModified':  obj['LastModified'].isoformat(),
                    'sizeBytes':     obj['Size'],
                })
        return sorted(resumes, key=lambda x: x['lastModified'], reverse=True)
    except Exception as exc:
        logger.error(f"S3 list_saved_resumes failed: {exc}")
        return []


def get_presigned_url(key: str, expires_in: int = 3600) -> str:
    """Generate a presigned GET URL for a given S3 key."""
    return _s3().generate_presigned_url(
        'get_object',
        Params={'Bucket': RESUMES_BUCKET, 'Key': key},
        ExpiresIn=expires_in,
    )
