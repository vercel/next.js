#!/bin/sh

# Generate self-signed certificate (only meant for testing don't use in production...)
# requires openssl be installed and in the $PATH

openssl genrsa -out localhost.key 2048
openssl req -new -x509 -key localhost.key -out localhost.cert -days 3650 -subj /CN=localhost
