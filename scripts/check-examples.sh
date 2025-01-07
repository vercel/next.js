#!/usr/bin/env bash

for folder in examples/* ; do
  if [ -f "$folder/package.json" ]; then
    cat $folder/package.json | jq '
      .private = true |
      del(.license, .version, .name, .author, .description)
    ' | sponge $folder/package.json
  fi
  if [ -f "$folder/tsconfig.json" ]; then
    if [ -d "$folder/app" ] || [ -d "$folder/src/app" ]; then
      cp packages/create-next-app/templates/app/ts/next-env.d.ts $folder/next-env.d.ts
    else
      cp packages/create-next-app/templates/default/ts/next-env.d.ts $folder/next-env.d.ts
    fi
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
