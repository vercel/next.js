terraform {
  backend "s3" {
    bucket       = "<YOUR_S3_BUCKET_NAME>"
    key          = "state/terraform.tfstate"
    region       = "<YOUR_AWS_REGION>"
    encrypt      = true
    use_lockfile = true
  }
}