declare -a testCases=(
  "with-typescript"
  "with-next-sass"
  # Tests @next/mdx
  "with-mdx"
  # Tests babel config
  "with-styled-components"
  "with-styled-jsx"
)

set -e

# Speeds up testing locally
export CI=1

nextDir=$(pwd)
tempDir=$(mktemp -d)
trap 'rm -rf -- "$tempDir"' EXIT

for testCase in "${testCases[@]}"
do
  testTarget="$tempDir/$testCase"

  mkdir -p "$testTarget"

  echo "--- Testing $testCase ---"
  cp -r "$nextDir/examples/$testCase/." "$testTarget"
  cd "$testTarget"

  touch yarn.lock
  yarn set version berry
  yarn config set pnpFallbackMode none
  yarn config set enableGlobalCache true
  yarn link --all --private -r "$nextDir"

  yarn build
done
