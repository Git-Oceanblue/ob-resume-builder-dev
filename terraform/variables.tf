variable "aws_region" {
  description = "AWS region for resources"
  type        = string
  default     = "us-east-2"
}

variable "environment" {
  description = "Environment name (dev, prod)"
  type        = string
  validation {
    condition     = contains(["dev", "prod"], var.environment)
    error_message = "Environment must be either 'dev' or 'prod'."
  }
}

variable "project_name" {
  description = "Name of the project"
  type        = string
  default     = "resume-auto"
}

# ── Lambda deployment (S3 upload — bypasses the 70 MB direct-upload limit) ───
variable "lambda_s3_bucket" {
  description = "S3 bucket that holds the Lambda deployment zip (use the Terraform state bucket)"
  type        = string
}

variable "lambda_s3_key" {
  description = "S3 key for the Lambda zip (e.g. lambda-artifacts/lambda.zip)"
  type        = string
  default     = "lambda-artifacts/lambda.zip"
}

variable "lambda_source_code_hash" {
  description = "Base64-encoded SHA-256 of the Lambda zip — lets Terraform detect code changes"
  type        = string
}

variable "openai_model_id" {
  description = "OpenAI model ID passed to the Lambda (e.g. gpt-4.1-mini, gpt-4o-mini)"
  type        = string
  default     = "gpt-4.1-mini"
}

variable "openai_api_key" {
  description = "OpenAI API key for the backend"
  type        = string
  sensitive   = true
}

# ── Custom domain (optional) ─────────────────────────────────────────────────
# Leave empty to manage the domain manually in the AWS Console (recommended
# when you have already connected your domain and don't want Terraform to
# touch it).  Set both variables to let Terraform manage the domain.

variable "custom_domain" {
  description = "Custom domain for CloudFront (e.g. app.oceanblue.com). Leave empty to protect manual Console setup."
  type        = string
  default     = ""
}

variable "acm_certificate_arn" {
  description = "ACM certificate ARN in us-east-1 for the custom domain. Leave empty to protect manual Console setup."
  type        = string
  default     = ""
}