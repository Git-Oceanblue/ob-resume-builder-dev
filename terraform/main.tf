terraform {
  required_version = ">= 1.0"
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
  }

  backend "s3" {
    bucket = "resumes-auto-terraform-state"
    key    = "terraform.tfstate"
    region = "us-east-2"
  }
}

provider "aws" {
  region = var.aws_region
  
  default_tags {
    tags = {
      Project     = "resume-auto"
      Environment = var.environment
      ManagedBy   = "terraform"
    }
  }
}

# Data sources
data "aws_caller_identity" "current" {}
data "aws_region" "current" {}

# S3 bucket for frontend
module "s3_frontend" {
  source = "./modules/s3"
  
  bucket_name = "resume-auto-frontend-${var.environment}-${data.aws_caller_identity.current.account_id}"
  environment = var.environment
}

# CloudFront distribution
module "cloudfront" {
  source = "./modules/cloudfront"

  s3_bucket_id          = module.s3_frontend.bucket_id
  s3_bucket_domain_name = module.s3_frontend.bucket_domain_name
  environment           = var.environment

  # Optional: pass these to let Terraform manage your custom domain.
  # If left empty, the lifecycle ignore_changes block protects whatever
  # you configured manually in the AWS Console.
  custom_domain       = var.custom_domain
  acm_certificate_arn = var.acm_certificate_arn
}

# S3 bucket for resume storage (original uploads + processed JSON)
resource "aws_s3_bucket" "resumes" {
  bucket = "ob-resumes-${var.environment}-${data.aws_caller_identity.current.account_id}"
}

resource "aws_s3_bucket_versioning" "resumes" {
  bucket = aws_s3_bucket.resumes.id
  versioning_configuration { status = "Enabled" }
}

resource "aws_s3_bucket_server_side_encryption_configuration" "resumes" {
  bucket = aws_s3_bucket.resumes.id
  rule {
    apply_server_side_encryption_by_default { sse_algorithm = "AES256" }
  }
}

resource "aws_s3_bucket_public_access_block" "resumes" {
  bucket                  = aws_s3_bucket.resumes.id
  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

# DynamoDB table for resume processing cache
resource "aws_dynamodb_table" "resume_cache" {
  name         = "ob-resume-cache-${var.environment}"
  billing_mode = "PAY_PER_REQUEST"
  hash_key     = "fileHash"

  attribute {
    name = "fileHash"
    type = "S"
  }

  ttl {
    attribute_name = "expiresAt"
    enabled        = true
  }
}

# Lambda function for backend
module "lambda" {
  source = "./modules/lambda"

  function_name           = "resume-auto-backend-${var.environment}"
  environment             = var.environment
  lambda_s3_bucket        = var.lambda_s3_bucket
  lambda_s3_key           = var.lambda_s3_key
  lambda_source_code_hash = var.lambda_source_code_hash
  openai_api_key          = var.openai_api_key
  openai_model_id         = var.openai_model_id
  resumes_s3_bucket       = aws_s3_bucket.resumes.id
  dynamodb_table          = aws_dynamodb_table.resume_cache.name
}