const escape = require('shell-quote').quote
const isWin = process.platform === 'win32'

module.exports = {
  '**/*.{js,jsx,ts,tsx}': filenames => {
    const escapedFileNames = filenames
      .map(filename => `"${isWin ? filename : escape([filename])}"`)
      .join(' ')
    return [
      `prettier --write ${escapedFileNames}`,
      `eslint --fix ${filenames.map(f => `"${f}"`).join(' ')}`,
      `git add ${escapedFileNames}`,
    ]
  },
  '**/*.{json,md,mdx,css,html,yml,yaml,scss,sass}': filenames => {
    const escapedFileNames = filenames
      .map(filename => `"${isWin ? filename : escape([filename])}"`)
      .join(' ')
    return [
      `prettier --write ${escapedFileNames}`,
      `git add ${escapedFileNames}`,
    ]
  },
}
