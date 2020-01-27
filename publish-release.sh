#!/bin/sh

if
  ls ~/.npmrc >/dev/null 2>&1 &&
  [[ $(git describe --exact-match 2> /dev/null || :) =~ -canary ]];
then
  # yarn run lerna publish from-git --npm-tag canary --yes
  echo "publishing canary"
else
  echo "Did not publish canary"
fi

if
  ls ~/.npmrc >/dev/null 2>&1 &&
  [[ ! $(git describe --exact-match 2> /dev/null || :) =~ -canary ]];
then
  # yarn run lerna publish from-git --yes
  echo "publishing stable"
else
  echo "Did not publish stable"
fi
