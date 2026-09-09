# Fetch the AWS Managed Cache Policy (Optimized for standard web traffic)
data "aws_cloudfront_cache_policy" "optimized" {
  name = "Managed-CachingOptimized"
}

# Fetch the AWS Managed Origin Request Policy (Passes query strings/cookies to your app)
data "aws_cloudfront_origin_request_policy" "all_viewer" {
  name = "Managed-AllViewerExceptHostHeader"
}

resource "aws_cloudfront_distribution" "cdn" {
  enabled             = true
  is_ipv6_enabled     = true
  wait_for_deployment = false # Prevents Terraform from hanging for 10+ minutes
  
  origin {
    # Point the CDN at the Load Balancer we provision in main.tf
    domain_name = aws_lb.main.dns_name
    origin_id   = "ALBOrigin"

    custom_origin_config {
      http_port              = 80
      https_port             = 443
      # Because this is the free tier without a custom SSL domain, we route internally via HTTP
      origin_protocol_policy = "http-only" 
      origin_ssl_protocols   = ["TLSv1.2"]
    }
  }

  default_cache_behavior {
    # Allow all HTTP methods so API POST/PUT requests still work
    allowed_methods  = ["DELETE", "GET", "HEAD", "OPTIONS", "PATCH", "POST", "PUT"]
    cached_methods   = ["GET", "HEAD"]
    target_origin_id = "ALBOrigin"

    viewer_protocol_policy = "redirect-to-https"

    # Attach the Managed Policies
    cache_policy_id          = data.aws_cloudfront_cache_policy.optimized.id
    origin_request_policy_id = data.aws_cloudfront_origin_request_policy.all_viewer.id
  }

  restrictions {
    geo_restriction {
      restriction_type = "none"
    }
  }

  viewer_certificate {
    # Gives the user a free HTTPS *.cloudfront.net domain out of the box
    cloudfront_default_certificate = true
  }
}

output "cloudfront_url" {
  description = "Your globally cached, HTTPS-secured application URL"
  value       = "https://${aws_cloudfront_distribution.cdn.domain_name}"
}

output "z_NEXT_STEP_REQUIRED" {
  value = "⚠️ Your infrastructure is up, but these URLs will return 503 errors until you push your code to GitHub and the Actions pipeline deploys your container."
}