variable "aws_region" {
  description = "AWS region for resources"
  type        = string
  default     = "us-east-1"
}

variable "environment" {
  description = "Environment name (testing,prod)"
  type        = string
  validation {
    condition     = contains(["testing","prod"], var.environment)
    error_message = "Environment must be 'testing','prod'."
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

variable "bedrock_api_key" {
  description = "Amazon Bedrock API key for the backend"
  type        = string
  sensitive   = true
}
