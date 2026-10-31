#!/bin/bash
# Rejected by: the server log check in test.sh. The build is green after the
# first three fixes, but /account requests with a cookie still log the vendored
# SDK's Date.now() read during the prerender.
set -euo pipefail
bash "$(dirname "$0")/_three-sites.sh"
