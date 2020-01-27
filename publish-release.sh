#!/bin/sh

if
  ls ~/.npmrc >/dev/null 2>&1 &&
  [[ $(git describe --exact-match 2> /dev/null || :) =~ -canary ]];
then
  echo "Publishing canary"
  yarn run lerna publish from-git --npm-tag canary --yes
else
  echo "Did not publish canary"
fi

if
  ls ~/.npmrc >/dev/null 2>&1 &&
  [[ ! $(git describe --exact-match 2> /dev/null || :) =~ -canary ]];
then
  echo "Publishing stable"
  yarn run lerna publish from-git --yes
else
  echo "Did not publish stable"
fi
