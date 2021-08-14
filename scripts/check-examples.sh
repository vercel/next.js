#!/bin/bash

for folder in examples/* ; do
  if [ -f "$folder/package.json" ]; then
    cp -n packages/create-next-app/templates/default/gitignore $folder/.gitignore;
    cat $folder/package.json | jq '
      .license = "MIT" |
      .private = true
    ' | sponge $folder/package.json
  fi
  if [ -f "$folder/tsconfig.json" ]; then
    cp packages/create-next-app/templates/typescript/next-env.d.ts $folder/next-env.d.ts
  fi
done;

if [[ ! -z $(git status -s) ]];then
  echo "Detected changes"
  git status
  exit 1
fi
