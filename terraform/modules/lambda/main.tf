# Resolve account ID for globally-unique bucket naming
data "aws_caller_identity" "current" {}

# ── S3 bucket for Lambda deployment artifacts ────────────────────────────────
# Lambda's direct-upload limit is 70 MB; deploying via S3 raises it to 250 MB.
resource "aws_s3_bucket" "artifacts" {
  bucket        = "${var.function_name}-artifacts-${data.aws_caller_identity.current.account_id}"
  force_destroy = true
}

resource "aws_s3_bucket_public_access_block" "artifacts" {
  bucket = aws_s3_bucket.artifacts.id

  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

# Upload the Lambda zip to S3 before the function is created/updated.
resource "aws_s3_object" "lambda_zip" {
  bucket = aws_s3_bucket.artifacts.id
  key    = "lambda.zip"
  source = var.lambda_zip_path
  etag   = filemd5(var.lambda_zip_path)

  depends_on = [aws_s3_bucket_public_access_block.artifacts]
}

# ── IAM role for Lambda function ─────────────────────────────────────────────
resource "aws_iam_role" "lambda_role" {
  name = "${var.function_name}-role"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Action = "sts:AssumeRole"
        Effect = "Allow"
        Principal = {
          Service = "lambda.amazonaws.com"
        }
      }
    ]
  })
}

# IAM policy for Lambda function
resource "aws_iam_role_policy" "lambda_policy" {
  name = "${var.function_name}-policy"
  role = aws_iam_role.lambda_role.id

  policy = jsonencode({
    Version = "2012-10-17",
    Statement = [
      {
        Effect = "Allow",
        Action = [
          "logs:CreateLogGroup",
          "logs:CreateLogStream",
          "logs:PutLogEvents"
        ],
        Resource = "arn:aws:logs:*:*:*"
      },
      {
        # Allow Lambda to call any Bedrock foundation model.
        # Bedrock uses IAM SigV4 auth — no API key required.
        Effect = "Allow",
        Action = [
          "bedrock:InvokeModel"
        ],
        Resource = "arn:aws:bedrock:*::foundation-model/*"
      }
    ]
  })
}

resource "aws_lambda_function" "backend" {
  # Deploy via S3 to bypass the 70 MB direct-upload limit (S3 limit is 250 MB).
  s3_bucket        = aws_s3_object.lambda_zip.bucket
  s3_key           = aws_s3_object.lambda_zip.key
  source_code_hash = filebase64sha256(var.lambda_zip_path)

  function_name = var.function_name
  role          = aws_iam_role.lambda_role.arn
  handler       = "lambda_handler.lambda_handler"
  runtime       = "python3.9"
  timeout       = 300
  memory_size   = 1024

  environment {
    variables = {
      ENVIRONMENT = var.environment
    }
  }

  depends_on = [
    aws_iam_role_policy.lambda_policy,
    aws_s3_object.lambda_zip,
  ]
}

# Lambda function URL
resource "aws_lambda_function_url" "backend_url" {
  function_name      = aws_lambda_function.backend.function_name
  authorization_type = "NONE"
  invoke_mode        = "BUFFERED"

  cors {
    allow_credentials = false
    allow_headers     = [
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

# CloudWatch Log Group
resource "aws_cloudwatch_log_group" "lambda_logs" {
  name              = "/aws/lambda/${var.function_name}"
  retention_in_days = 14
}
