#!/bin/bash

cd `dirname $0`

for folder in examples/* ; do
  cp -n packages/create-next-app/templates/default/gitignore $folder/.gitignore;
  if [ -f "$folder/package.json" ]; then
    cat $folder/package.json | jq '.license = "MIT"' | sponge $folder/package.json
  fi
done;

if [[ ! -z $(git status -s) ]];then
  echo "Detected changes"
  git status
  exit 1
fi
