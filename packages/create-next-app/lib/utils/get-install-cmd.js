const execa = require('execa')

let cmd

module.exports = function getInstallCmd () {
  if (cmd) {
    return cmd
  }

  try {
    execa.shellSync('yarnpkg --version')
    cmd = 'yarn'
  } catch (e) {
    cmd = 'npm'
  }

  return cmd
}
