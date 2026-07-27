#!/bin/sh

protected_branch='canary'

# github blocks password-based auth, but still usable via API token
protected_remote_urls="\
  git@github.com:vercel/next.js.git
  https://github.com/vercel/next.js.git"


# The pre-push hook [...] receives the name and location of the remote as parameters
# https://git-scm.com/book/en/v2/Customizing-Git-Git-Hooks
remote_name="$1"
remote_url="$2"



# if we're pushing to a fork, we don't need to protect canary.
# check if the remote is one of the protected ones.
is_remote_protected=0
for protected_remote_url in $protected_remote_urls; do
  if [ "$remote_url" = "$protected_remote_url" ]; then
    is_remote_protected=1
    break
  fi
done

if [ "$is_remote_protected" = 0 ]; then
  exit 0
fi



# check if the push is targeting canary on the remote
# https://stackoverflow.com/a/44156933
push_targets_protected_branch=0
protected_ref="refs/heads/$protected_branch"
while read -r _local_ref _local_sha remote_ref _remote_sha; do
  if [ "$remote_ref" = "$protected_ref" ]; then
    push_targets_protected_branch=1
    break
  fi
done

if [ "$push_targets_protected_branch" = "1" ]; then
  echo "You probably didn't intend to push directly to '$protected_branch' on '$remote_name' ($remote_url)." >&2
  echo "If you're sure that that's what you want to do, bypass this check via" >&2
  echo "" >&2
  echo "  git push --no-verify" >&2
  echo "" >&2
  exit 1
fi
