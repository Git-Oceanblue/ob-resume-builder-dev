# ══════════════════════════════════════════════════════════════════════════════
# DATA SOURCES
# ══════════════════════════════════════════════════════════════════════════════

data "aws_caller_identity" "current" {}
data "aws_region" "current" {}

# ══════════════════════════════════════════════════════════════════════════════
# LOCALS
# ══════════════════════════════════════════════════════════════════════════════

locals {
  account_id  = data.aws_caller_identity.current.account_id
  region      = data.aws_region.current.name

  # S3 bucket names must be globally unique and ≤ 63 characters.
  # Pattern: <function-name>-artifacts-<account-id>
  # e.g.   : resume-auto-backend-prod-artifacts-417915984158  (49 chars)
  artifacts_bucket = "${var.function_name}-artifacts-${local.account_id}"

  # Whether a separate Layer zip was provided by the caller.
  has_layer = var.lambda_layer_zip_path != ""
}

# ══════════════════════════════════════════════════════════════════════════════
# S3 ARTIFACTS BUCKET
# Stores function code zip and (optionally) the dependency layer zip.
# Lambda's direct-upload limit is 70 MB; S3-backed deployments support 250 MB.
# ══════════════════════════════════════════════════════════════════════════════

resource "aws_s3_bucket" "artifacts" {
  bucket        = local.artifacts_bucket
  force_destroy = true

  tags = {
    Name    = local.artifacts_bucket
    Purpose = "lambda-artifacts"
  }
}

# Block all public access — Lambda artifacts must never be public.
resource "aws_s3_bucket_public_access_block" "artifacts" {
  bucket = aws_s3_bucket.artifacts.id

  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

# Enable versioning so each deploy creates a new S3 object version.
# This lets Terraform pin Lambda to the exact version just uploaded,
# preventing race conditions on concurrent deploys.
resource "aws_s3_bucket_versioning" "artifacts" {
  bucket = aws_s3_bucket.artifacts.id

  versioning_configuration {
    status = "Enabled"
  }

  depends_on = [aws_s3_bucket_public_access_block.artifacts]
}

# Encrypt all artifacts at rest using AES-256 (SSE-S3).
# BucketKeyEnabled reduces KMS API calls if you later migrate to SSE-KMS.
resource "aws_s3_bucket_server_side_encryption_configuration" "artifacts" {
  bucket = aws_s3_bucket.artifacts.id

  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm = "AES256"
    }
    bucket_key_enabled = true
  }

  depends_on = [aws_s3_bucket_public_access_block.artifacts]
}

# Lifecycle policy: expire non-current S3 versions after 30 days.
# Old function/layer zips accumulate quickly — this keeps storage costs low.
resource "aws_s3_bucket_lifecycle_configuration" "artifacts" {
  bucket = aws_s3_bucket.artifacts.id

  rule {
    id     = "expire-noncurrent-versions"
    status = "Enabled"

    noncurrent_version_expiration {
      # Keep the last 3 non-current versions for rollback; expire the rest.
      newer_noncurrent_versions = 3
      noncurrent_days           = 30
    }

    abort_incomplete_multipart_upload {
      days_after_initiation = 7
    }
  }

  # Versioning must be enabled before lifecycle rules referencing
  # noncurrent versions can be applied.
  depends_on = [aws_s3_bucket_versioning.artifacts]
}

# ══════════════════════════════════════════════════════════════════════════════
# S3 OBJECTS — upload artifacts before Lambda resource is created/updated
# ══════════════════════════════════════════════════════════════════════════════

# Function code zip (application code only — no site-packages when using Layer).
resource "aws_s3_object" "lambda_zip" {
  bucket = aws_s3_bucket.artifacts.id
  key    = "function/lambda.zip"
  source = var.lambda_zip_path

  # etag triggers a new S3 version whenever the zip content changes.
  etag = filemd5(var.lambda_zip_path)

  depends_on = [
    aws_s3_bucket_versioning.artifacts,
    aws_s3_bucket_server_side_encryption_configuration.artifacts,
  ]
}

# Dependency layer zip (only uploaded when lambda_layer_zip_path is provided).
resource "aws_s3_object" "lambda_layer_zip" {
  count = local.has_layer ? 1 : 0

  bucket = aws_s3_bucket.artifacts.id
  key    = "layer/dependencies.zip"
  source = var.lambda_layer_zip_path
  etag   = filemd5(var.lambda_layer_zip_path)

  depends_on = [
    aws_s3_bucket_versioning.artifacts,
    aws_s3_bucket_server_side_encryption_configuration.artifacts,
  ]
}

# ══════════════════════════════════════════════════════════════════════════════
# LAMBDA LAYER (optional)
# Packages site-packages as a reusable, independently versioned layer.
# Lambda extracts the layer to /opt/; Python finds packages under /opt/python/.
# ══════════════════════════════════════════════════════════════════════════════

resource "aws_lambda_layer_version" "dependencies" {
  count = local.has_layer ? 1 : 0

  layer_name = "${var.function_name}-dependencies"
  description = "Python dependencies for ${var.function_name} — managed by Terraform"

  s3_bucket        = aws_s3_object.lambda_layer_zip[0].bucket
  s3_key           = aws_s3_object.lambda_layer_zip[0].key
  s3_object_version = aws_s3_object.lambda_layer_zip[0].version_id

  # source_code_hash detects content changes independently of the S3 etag,
  # ensuring Terraform publishes a new layer version when packages change.
  source_code_hash = filebase64sha256(var.lambda_layer_zip_path)

  compatible_runtimes      = ["python3.9"]
  compatible_architectures = ["x86_64"]
}

# ══════════════════════════════════════════════════════════════════════════════
# IAM ROLE
# ══════════════════════════════════════════════════════════════════════════════

resource "aws_iam_role" "lambda_role" {
  name = "${var.function_name}-role"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid    = "LambdaAssumeRole"
        Effect = "Allow"
        Action = "sts:AssumeRole"
        Principal = {
          Service = "lambda.amazonaws.com"
        }
      }
    ]
  })

  tags = {
    Environment = var.environment
  }
}

# ══════════════════════════════════════════════════════════════════════════════
# IAM POLICY
# Scoped to this function's log group and to Bedrock in this region.
# Bedrock uses IAM SigV4 (boto3) — no API key required.
# ══════════════════════════════════════════════════════════════════════════════

resource "aws_iam_role_policy" "lambda_policy" {
  name = "${var.function_name}-policy"
  role = aws_iam_role.lambda_role.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid    = "CloudWatchLogs"
        Effect = "Allow"
        Action = [
          "logs:CreateLogGroup",
          "logs:CreateLogStream",
          "logs:PutLogEvents"
        ]
        # Scoped to this function's log group only (least privilege).
        Resource = [
          "arn:aws:logs:${local.region}:${local.account_id}:log-group:/aws/lambda/${var.function_name}",
          "arn:aws:logs:${local.region}:${local.account_id}:log-group:/aws/lambda/${var.function_name}:*"
        ]
      },
      {
        Sid    = "BedrockInvokeModel"
        Effect = "Allow"
        Action = ["bedrock:InvokeModel"]
        # Use var.bedrock_region (not local.region) so the IAM permission matches
        # the region boto3 actually calls — these can differ when the Lambda
        # deployment region and the Bedrock model region are not the same.
        Resource = "arn:aws:bedrock:${var.bedrock_region}::foundation-model/*"
      }
    ]
  })
}

# ══════════════════════════════════════════════════════════════════════════════
# LAMBDA FUNCTION
# Uses S3 for code deployment (bypasses 70 MB direct-upload API limit).
# s3_object_version pins Lambda to the exact S3 version just uploaded,
# preventing stale-code deploys in concurrent pipeline runs.
# ══════════════════════════════════════════════════════════════════════════════

resource "aws_lambda_function" "backend" {
  function_name = var.function_name
  role          = aws_iam_role.lambda_role.arn
  handler       = "lambda_handler.lambda_handler"
  runtime       = "python3.9"
  timeout       = 300
  memory_size   = 1024

  # S3-based deployment — 250 MB limit instead of 70 MB direct-upload limit.
  s3_bucket         = aws_s3_object.lambda_zip.bucket
  s3_key            = aws_s3_object.lambda_zip.key
  s3_object_version = aws_s3_object.lambda_zip.version_id

  # source_code_hash tells Terraform (and Lambda) that the code changed,
  # triggering an update even if the S3 key stays the same.
  source_code_hash = filebase64sha256(var.lambda_zip_path)

  # Attach layer when provided; otherwise run with no extra layers.
  layers = local.has_layer ? [aws_lambda_layer_version.dependencies[0].arn] : []

  environment {
    variables = {
      ENVIRONMENT    = var.environment
      # Explicit Bedrock region so boto3 calls the correct endpoint.
      # Must match the region in the IAM policy above.
      BEDROCK_REGION = var.bedrock_region
    }
  }

  depends_on = [
    aws_iam_role_policy.lambda_policy,
    aws_cloudwatch_log_group.lambda_logs,
    aws_s3_object.lambda_zip,
  ]
}

# ══════════════════════════════════════════════════════════════════════════════
# LAMBDA FUNCTION URL
# Public HTTPS endpoint — no auth (internal service, secured at app layer).
# ══════════════════════════════════════════════════════════════════════════════

resource "aws_lambda_function_url" "backend_url" {
  function_name      = aws_lambda_function.backend.function_name
  authorization_type = "NONE"
  # RESPONSE_STREAM removes the 6 MB BUFFERED payload limit and lets Lambda
  # flush SSE chunks to the browser progressively instead of buffering the
  # entire response in memory before sending.
  invoke_mode        = "RESPONSE_STREAM"

  cors {
    allow_credentials = false
    allow_headers = [
      "content-type",
      "x-amz-date",
      "authorization",
      "x-api-key",
      "x-amz-security-token",
      "x-amz-user-agent"
    ]
    allow_methods  = ["GET", "POST", "PUT", "DELETE", "HEAD"]
    allow_origins  = ["*"]
    expose_headers = ["date", "keep-alive"]
    max_age        = 86400
  }
}

# ══════════════════════════════════════════════════════════════════════════════
# CLOUDWATCH LOG GROUP
# Pre-create the log group so retention is enforced from the first invocation.
# Without this, Lambda auto-creates the group with no retention limit.
# ══════════════════════════════════════════════════════════════════════════════

resource "aws_cloudwatch_log_group" "lambda_logs" {
  name              = "/aws/lambda/${var.function_name}"
  retention_in_days = 14

  tags = {
    Environment = var.environment
  }
}
