
# IAM role for Lambda function
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
        Effect = "Allow",
        Action = [
          "s3:GetObject",
          "s3:PutObject",
          "s3:DeleteObject",
          "s3:ListBucket",
          "s3:GeneratePresignedUrl"
        ],
        Resource = var.resumes_s3_bucket != "" ? [
          "arn:aws:s3:::${var.resumes_s3_bucket}",
          "arn:aws:s3:::${var.resumes_s3_bucket}/*"
        ] : ["arn:aws:s3:::placeholder-disabled"]
      },
      {
        Effect = "Allow",
        Action = [
          "dynamodb:GetItem",
          "dynamodb:PutItem",
          "dynamodb:DeleteItem",
          "dynamodb:Query",
          "dynamodb:Scan"
        ],
        Resource = var.dynamodb_table != "" ? [
          "arn:aws:dynamodb:*:*:table/${var.dynamodb_table}"
        ] : ["arn:aws:dynamodb:*:*:table/placeholder-disabled"]
      }
    ]
  })
}

resource "aws_lambda_function" "backend" {
  # Deploy from S3 to avoid the 70 MB direct-upload limit (S3 supports 250 MB)
  s3_bucket        = var.lambda_s3_bucket
  s3_key           = var.lambda_s3_key
  function_name    = var.function_name
  role             = aws_iam_role.lambda_role.arn
  handler          = "lambda_handler.lambda_handler"
  runtime          = "python3.9"
  timeout          = 300
  memory_size      = 1024
  source_code_hash = var.lambda_source_code_hash

  environment {
    variables = {
      ENVIRONMENT          = var.environment
      OPENAI_API_KEY       = var.openai_api_key
      OPENAI_MODEL_ID      = var.openai_model_id
      RESUMES_S3_BUCKET    = var.resumes_s3_bucket
      DYNAMODB_CACHE_TABLE = var.dynamodb_table
      CACHE_TTL_HOURS      = "24"
    }
  }

  depends_on = [
    aws_iam_role_policy.lambda_policy,
  ]
}

# Lambda function URL
resource "aws_lambda_function_url" "backend_url" {
  function_name      = aws_lambda_function.backend.function_name
  authorization_type = "NONE"
  invoke_mode       = "BUFFERED"

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
