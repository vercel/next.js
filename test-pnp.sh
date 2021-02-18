declare -a testCases=(
  # Tests the webpack require hook
  "progressive-web-app"  
  
  "with-typescript"
  "with-next-sass"
  # Tests @next/mdx
  "with-mdx"
  # Tests babel config
  "with-styled-components"
)

set -e

# Speeds up testing locally
export CI=1

rm -rf ./e2e-tests

initialDir=$(pwd)

for testCase in "${testCases[@]}"
do
  cd $initialDir

  echo "--- Testing $testCase ---"
  mkdir -p "./e2e-tests/$testCase"
  cp -r "./examples/$testCase/." "./e2e-tests/$testCase"
  cd "./e2e-tests/$testCase"

  touch yarn.lock
  yarn set version berry
  yarn config set pnpFallbackMode none
  yarn config set enableGlobalCache true
  yarn link --all --private -r ../..

  yarn build
done
