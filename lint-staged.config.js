const { quote } = require('shell-quote')
const { ESLint } = require('eslint')

const eslint = new ESLint()
const isWin = process.platform === 'win32'

module.exports = {
  '**/*.{js,jsx,mjs,ts,tsx,mts}': (filenames) => {
    const escapedFileNames = filenames
      .map((filename) => (isWin ? filename : escape([filename])))
      .join(' ')
    return [
      `prettier --with-node-modules --ignore-path .prettierignore_staged --write ${escapedFileNames}`,
      `eslint --no-ignore --max-warnings=0 --fix ${filenames
        .filter((file) => !eslint.isPathIgnored(file))
        .map((f) => `"${f}"`)
        .join(' ')}`,
      `git add ${escapedFileNames}`,
    ]
  },
  '**/*.{json,md,mdx,css,html,yml,yaml,scss}': (filenames) => {
    const escapedFileNames = filenames
      .map((filename) => (isWin ? filename : escape([filename])))
      .join(' ')
    return [
      `prettier --with-node-modules --ignore-path .prettierignore_staged --write ${escapedFileNames}`,
      `git add ${escapedFileNames}`,
    ]
  },
  '**/*.rs': (filenames) => {
    const escapedFileNames = filenames
      .map((filename) => (isWin ? filename : escape([filename])))
      .join(' ')
    return [`cargo fmt -- ${escapedFileNames}`, `git add ${escapedFileNames}`]
  },
}

function escape(str) {
  const escaped = quote(str)
  return escaped.replace(/\\@/g, '@')
}
