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
  description = "Local path to the packaged Lambda function code zip (built by CI)"
  type        = string
}

variable "lambda_layer_zip_path" {
  description = "Optional local path to the Lambda Layer zip (Python dependencies). Leave empty to skip layer deployment."
  type        = string
  default     = ""
}

