#!/bin/bash

# Script to retry setting up Node.js version up to 5 times with a 15-second interval between retries

# Define the number of retries and the sleep interval in seconds
max_retries=5
sleep_interval=15

# Check if NODE_VERSION is set, if not, exit with an error message
if [ -z "${NODE_VERSION}" ]; then
  echo "Error: NODE_VERSION is not set. Please set the Node.js version to install."
  exit 1
fi

# Function to install Node.js
install_node() {
  curl -s "https://install-node.vercel.app/v${NODE_VERSION}" | FORCE=1 bash
}

# Retry loop for installing Node.js
for (( i=1; i<=max_retries; i++ )); do
  echo "Attempt $i of $max_retries: Installing Node.js version ${NODE_VERSION}..."
  if install_node; then
    echo "Node.js version ${NODE_VERSION} installed successfully."
    exit 0
  else
    echo "Installation failed. Retrying in $sleep_interval seconds..."
    sleep $sleep_interval
  fi
done

echo "Failed to install Node.js version ${NODE_VERSION} after $max_retries attempts."
exit 1
