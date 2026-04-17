variable "s3_bucket_id" {
  description = "ID of the S3 bucket"
  type        = string
}

variable "s3_bucket_domain_name" {
  description = "Domain name of the S3 bucket"
  type        = string
}

variable "environment" {
  description = "Environment name"
  type        = string
}

# ── Custom domain (optional) ────────────────────────────────────────────────
# Set these if you want Terraform to manage your custom domain.
# If you configured the domain manually in the Console, leave these empty and
# the lifecycle ignore_changes block will protect your settings from being wiped.

variable "custom_domain" {
  description = "Custom domain name (e.g. app.oceanblue.com). Leave empty to manage manually."
  type        = string
  default     = ""
}

variable "acm_certificate_arn" {
  description = "ACM certificate ARN for the custom domain (must be in us-east-1). Leave empty to manage manually."
  type        = string
  default     = ""
}
