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

variable "lambda_zip_path" {
  description = "Local path to the packaged Lambda zip (built by CI)"
  type        = string
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