#!/bin/bash

cd `dirname $0`

for folder in examples/* ;
  do cp -n packages/create-next-app/templates/default/gitignore $folder/.gitignore;
done;

if [[ ! -z $(git status -s) ]];then
  echo "Detected changes"
  git status
  exit 1
fi
