const { CLIEngine } = require('eslint')

const cli = new CLIEngine({})

// see: https://github.com/okonet/lint-staged#how-can-i-ignore-files-from-eslintignore-

module.exports = {
  '*.js': (files) =>
    'eslint --max-warnings=0 ' + files.filter((file) => !cli.isPathIgnored(file)).join(' ')
}
