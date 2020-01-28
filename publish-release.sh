#!/bin/bash

git describe --exact-match

if [[ ! $? -eq 0 ]];then
  echo "Nothing to publish, exiting.."
  exit 0;
fi

if [[ -z "$NPM_TOKEN" ]];then
  echo "No NPM_TOKEN, exiting.."
  exit 0;
fi

echo "//registry.npmjs.org/:_authToken=$NPM_TOKEN" >> ~/.npmrc

if [[ $(git describe --exact-match 2> /dev/null || :) =~ -canary ]];
then
  echo "Publishing canary"
  yarn run lerna publish from-git --npm-tag canary --yes
else
  echo "Did not publish canary"
fi

if [[ ! $(git describe --exact-match 2> /dev/null || :) =~ -canary ]];then
  echo "Publishing stable"
  yarn run lerna publish from-git --yes
else
  echo "Did not publish stable"
fi
