output "lambda_function_arn" {
  description = "ARN of the Lambda function"
  value       = aws_lambda_function.backend.arn
}

output "lambda_function_name" {
  description = "Name of the Lambda function"
  value       = aws_lambda_function.backend.function_name
}

output "function_url" {
  description = "HTTPS endpoint for the Lambda function"
  value       = aws_lambda_function_url.backend_url.function_url
}

output "artifacts_bucket_name" {
  description = "Name of the S3 bucket holding Lambda deployment artifacts"
  value       = aws_s3_bucket.artifacts.id
}

output "layer_arn" {
  description = "ARN of the Lambda Layer (empty string when no layer was deployed)"
  value       = local.has_layer ? aws_lambda_layer_version.dependencies[0].arn : ""
}
