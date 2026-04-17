variable "function_name" {
  description = "Name of the Lambda function"
  type        = string
}

variable "environment" {
  description = "Environment name"
  type        = string
}

# ── Lambda deployment via S3 (bypasses the 70 MB direct-upload limit) ────────
variable "lambda_s3_bucket" {
  description = "S3 bucket that holds the Lambda deployment zip"
  type        = string
}

variable "lambda_s3_key" {
  description = "S3 key of the Lambda deployment zip (e.g. lambda-artifacts/lambda.zip)"
  type        = string
}

variable "lambda_source_code_hash" {
  description = "Base64-encoded SHA-256 of the zip, used by Terraform to detect code changes"
  type        = string
}

variable "openai_api_key" {
  description = "OpenAI API key"
  type        = string
  sensitive   = true
}

variable "openai_model_id" {
  description = "OpenAI model ID (e.g. gpt-4.1-mini, gpt-4o-mini)"
  type        = string
  default     = "gpt-4.1-mini"
}

variable "resumes_s3_bucket" {
  description = "S3 bucket name for resume storage"
  type        = string
  default     = ""
}

variable "dynamodb_table" {
  description = "DynamoDB table name for resume caching"
  type        = string
  default     = ""
}
