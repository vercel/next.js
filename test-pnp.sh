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

rm -rf /tmp/e2e-tests

initialDir=$(pwd)

for testCase in "${testCases[@]}"
do
  cd $initialDir

  echo "--- Testing $testCase ---"
  mkdir -p "/tmp/e2e-tests/$testCase"
  cp -r "./examples/$testCase/." "/tmp/e2e-tests/$testCase"
  cd "/tmp/e2e-tests/$testCase"

  touch yarn.lock
  yarn set version berry
  yarn config set pnpFallbackMode none
  yarn config set enableGlobalCache true
  yarn link --all --private -r "$initialDir"

  yarn build
done
