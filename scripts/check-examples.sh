#!/usr/bin/env bash

for folder in examples/* ; do
  if [ -f "$folder/package.json" ]; then
    cat $folder/package.json | jq '
      .private = true |
      del(.license, .version, .name, .author, .description)
    ' | sponge $folder/package.json
  fi
  if [ -f "$folder/tsconfig.json" ]; then
    cp packages/create-next-app/templates/default/ts/next-env.d.ts $folder/next-env.d.ts
  fi
  if [ ! -f "$folder/.gitignore" ]; then
    cp packages/create-next-app/templates/default/js/gitignore $folder/.gitignore;
  fi
done;

if [[ ! -z $(git status -s) ]];then
  echo "Detected changes"
  git status
  exit 1
fi
