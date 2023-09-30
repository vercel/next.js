#!/usr/bin/env bash

START_DIR=$PWD
# gets last argument which should be the project dir
for PROJECT_DIR in $@;do :;done

if [ -z $PROJECT_DIR ];then
  echo "No project directory provided, exiting..."
  exit 1;
fi;

if [ ! -d $PROJECT_DIR ];then
  echo "Invalid project directory provided, exiting..."
  exit 1;
fi;

if [ $PROJECT_DIR == $PWD ] || [ "$PROJECT_DIR" == "." ];then
  echo "Project directory can not be root, exiting..."
  exit 1;
fi;

CONFLICTING_DEPS=("react" "react-dom" "styled-jsx" "next")

for dep in ${CONFLICTING_DEPS[@]};do 
  if [ -d "$PROJECT_DIR/node_modules/$dep" ];then
    HAS_CONFLICTING_DEP="yup"
  fi;
done

if [ ! -z $HAS_CONFLICTING_DEP ] || [ ! -d "$PROJECT_DIR/node_modules" ];then
  cd $PROJECT_DIR
  pnpm i --ignore-workspace
  for dep in ${CONFLICTING_DEPS[@]};do 
    rm -rf node_modules/$dep
  done
fi

cd $START_DIR
pnpm next $@
