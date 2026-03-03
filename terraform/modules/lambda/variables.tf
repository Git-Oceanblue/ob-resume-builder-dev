variable "function_name" {
  description = "Name of the Lambda function"
  type        = string
}

variable "environment" {
  description = "Environment name"
  type        = string
}

variable "lambda_zip_path" {
  description = "Local path to packaged Lambda zip"
  type        = string
}

variable "bedrock_api_key" {
  description = "Amazon Bedrock API key"
  type        = string
  sensitive   = true
}
