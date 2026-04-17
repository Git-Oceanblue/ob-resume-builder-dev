# CloudFront Origin Access Control
resource "aws_cloudfront_origin_access_control" "frontend" {
  name                              = "resume-auto-${var.environment}"
  description                       = "OAC for resume-auto ${var.environment}"
  origin_access_control_origin_type = "s3"
  signing_behavior                  = "always"
  signing_protocol                  = "sigv4"
}

# CloudFront distribution
resource "aws_cloudfront_distribution" "frontend" {
  comment = "resume-auto-${var.environment}"

  origin {
    domain_name              = var.s3_bucket_domain_name
    origin_access_control_id = aws_cloudfront_origin_access_control.frontend.id
    origin_id                = "S3-resume-auto-${var.environment}"
  }

  enabled             = true
  is_ipv6_enabled     = true
  default_root_object = "index.html"

  # Custom domain aliases — only set when variable is provided.
  # If you configured aliases manually in the Console, Terraform will ignore
  # this field on subsequent applies (see lifecycle block below).
  aliases = var.custom_domain != "" ? [var.custom_domain] : []

  default_cache_behavior {
    allowed_methods  = ["GET", "HEAD", "OPTIONS", "PUT", "POST", "PATCH", "DELETE"]
    cached_methods   = ["GET", "HEAD"]
    target_origin_id = "S3-resume-auto-${var.environment}"

    forwarded_values {
      query_string = false
      cookies {
        forward = "none"
      }
    }

    viewer_protocol_policy = "redirect-to-https"
    min_ttl                = 0
    default_ttl            = 3600
    max_ttl                = 86400
    compress               = true
  }

  # Cache behavior for static assets
  ordered_cache_behavior {
    path_pattern     = "/static/*"
    allowed_methods  = ["GET", "HEAD", "OPTIONS"]
    cached_methods   = ["GET", "HEAD", "OPTIONS"]
    target_origin_id = "S3-resume-auto-${var.environment}"

    forwarded_values {
      query_string = false
      headers      = ["Origin"]
      cookies {
        forward = "none"
      }
    }

    min_ttl                = 0
    default_ttl            = 86400
    max_ttl                = 31536000
    compress               = true
    viewer_protocol_policy = "https-only"
  }

  custom_error_response {
    error_code         = 404
    response_code      = 200
    response_page_path = "/index.html"
  }

  custom_error_response {
    error_code         = 403
    response_code      = 200
    response_page_path = "/index.html"
  }

  restrictions {
    geo_restriction {
      restriction_type = "none"
    }
  }

  # Viewer certificate:
  # - If acm_certificate_arn is provided → use ACM cert (required for custom domains)
  # - Otherwise fall back to the default CloudFront certificate
  viewer_certificate {
    acm_certificate_arn            = var.acm_certificate_arn != "" ? var.acm_certificate_arn : null
    ssl_support_method             = var.acm_certificate_arn != "" ? "sni-only" : null
    minimum_protocol_version       = var.acm_certificate_arn != "" ? "TLSv1.2_2021" : null
    cloudfront_default_certificate = var.acm_certificate_arn == ""
  }

  tags = {
    Environment = var.environment
  }

  # ── CRITICAL: protect manually-configured domain settings ──────────────────
  # Terraform only knows what it originally created. Any domain / certificate
  # you wired up in the AWS Console (aliases, viewer_certificate) lives outside
  # Terraform state, so every apply would overwrite those fields back to the
  # defaults and destroy your custom domain setup.
  #
  # ignore_changes tells Terraform: "I own these fields — don't touch them."
  # To change aliases/cert via Terraform in future, supply the variables above
  # and then run:  terraform apply -target=module.cloudfront
  lifecycle {
    ignore_changes = [
      aliases,
      viewer_certificate,
    ]
  }

  depends_on = [aws_cloudfront_origin_access_control.frontend]
}
