#!/bin/bash
# Rejected by: check-source.mjs. Opting /account out of instant validation is
# the fix the overlay suggests, but it does not stop the SDK's Date.now() read
# from being reported at request time, and the task forbids opt-outs.
set -euo pipefail
bash "$(dirname "$0")/_three-sites.sh"
sed -i 's#^export default function AccountPage#export const instant = false\n\nexport default function AccountPage#' app/account/page.tsx
