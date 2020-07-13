#!/bin/bash

# run this script from examples folder
# will copy .gitignore file to all example folders 
# it will not overwrite an existing .gitignore file
# -n option means no overwrite
# -v option means verbose

for folder in * ; 
  do cp -n -v .gitignore $folder; 
done;