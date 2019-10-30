const escape = require('shell-quote').quote

module.exports = {
  '**/*.{js,jsx}': filenames => {
    const escapedFileNames = filenames
      .map(filename => `"${escape([filename])}"`)
      .join(' ')
    return [
      `prettier --write ${escapedFileNames}`,
      `standard --fix ${escapedFileNames}`,
      `git add ${escapedFileNames}`
    ]
  },
  '**/*.{json,ts,tsx,md,mdx,css,html,yml,yaml,scss,sass}': filenames => {
    const escapedFileNames = filenames
      .map(filename => `"${escape([filename])}"`)
      .join(' ')
    return [
      `prettier --write ${escapedFileNames}`,
      `git add ${escapedFileNames}`
    ]
  }
}
