variable "function_name" {
  description = "Fully qualified Lambda function name (project + environment, e.g. resume-auto-backend-prod)"
  type        = string
}

variable "environment" {
  description = "Deployment environment (dev, qa, testing, prod)"
  type        = string
}

variable "lambda_zip_path" {
  description = "Local path to the Lambda function code zip (application code only — no dependencies)"
  type        = string
}

variable "bedrock_region" {
  description = "AWS region where Bedrock models are accessed (must match the IAM policy and BEDROCK_REGION env var)"
  type        = string
  default     = "us-east-2"
}

variable "lambda_layer_zip_path" {
  description = <<-EOT
    Optional local path to the Lambda Layer zip (Python dependencies).
    When provided, dependencies are deployed as a versioned Lambda Layer,
    keeping the function zip minimal. The layer zip must have packages
    under a top-level `python/` directory (standard Lambda Layer layout).
    Leave empty ("") to bundle everything inside the function zip —
    S3-based deployment is still used in both cases.
  EOT
  type    = string
  default = ""
}
