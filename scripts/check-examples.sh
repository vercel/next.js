#!/bin/bash

for folder in examples/* ; do
  if [ -f "$folder/package.json" ]; then
    cp -n packages/create-next-app/templates/default/gitignore $folder/.gitignore;
    cat $folder/package.json | jq '.license = "MIT"' | sponge $folder/package.json
  fi
done;

if [[ ! -z $(git status -s) ]];then
  echo "Detected changes"
  git status
  exit 1
fi
