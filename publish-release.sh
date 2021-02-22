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

function publish_bazel() {
  yarn run bazel run //packages/eslint-plugin-next:publish -- --tag=$1
  yarn run bazel run //packages/next-bundle-analyzer:publish -- --tag=$1
  yarn run bazel run //packages/next-codemod:publish -- --tag=$1
  yarn run bazel run //packages/next-mdx:publish -- --tag=$1
  yarn run bazel run //packages/next-plugin-google-analytics:publish -- --tag=$1
  yarn run bazel run //packages/next-plugin-sentry:publish -- --tag=$1
  yarn run bazel run //packages/next-plugin-storybook:publish -- --tag=$1
}

if [[ $(git describe --exact-match 2> /dev/null || :) =~ -canary ]];
then
  echo "Publishing canary"
  publish_bazel canary
  yarn run lerna publish from-package --npm-tag canary --yes

  # Make sure to exit script with code 1 if publish failed
  if [[ ! $? -eq 0 ]];then
    exit 1;
  fi
else
  echo "Did not publish canary"
fi

if [[ ! $(git describe --exact-match 2> /dev/null || :) =~ -canary ]];then
  echo "Publishing stable"
  publish_bazel latest
  yarn run lerna publish from-package --yes

  # Make sure to exit script with code 1 if publish failed
  if [[ ! $? -eq 0 ]];then
    exit 1;
  fi
else
  echo "Did not publish stable"
fi
