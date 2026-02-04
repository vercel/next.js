# Goes through all subfolders of $folder and moves all files into a new "input" subdirectory


folder=scope-hoisting

set -e
shopt -s extglob

for f in "$folder"/*; do
  mkdir -p "$f/input"
  mv "$f"/!(input) "$f"/input
done
