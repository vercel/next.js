const path = require('path')
const fs = require('fs')
const copyDir = require('./utils/copy-dir')
const install = require('./utils/install')
const loadExample = require('./utils/load-example')
const messages = require('./messages')

module.exports = function createNextApp (opts) {
  const projectName = opts.projectName

  if (!projectName) {
    console.log(messages.missingProjectName())
    process.exit(1)
  }

  if (fs.existsSync(projectName) && projectName !== '.') {
    console.log(messages.alreadyExists(projectName))
    process.exit(1)
  }

  const projectPath = (opts.projectPath = process.cwd() + '/' + projectName)

  if (opts.example) {
    loadExample({
      projectName: projectName,
      example: opts.example
    }).then(installWithMessageFactory(opts))
  } else {
    const templatePath = path.resolve(__dirname, './templates/default')

    copyDir({
      templatePath: templatePath,
      projectPath: projectPath,
      projectName: projectName
    })
      .then(installWithMessageFactory(opts))
      .catch(function (err) {
        throw err
      })
  }
}

function installWithMessageFactory (opts) {
  const projectName = opts.projectName
  const projectPath = opts.projectPath

  return function installWithMessage () {
    return install({
      projectName: projectName,
      projectPath: projectPath,
      packages: ['react', 'react-dom', 'next']
    })
      .then(function () {
        console.log(messages.start(projectName))
      })
      .catch(function (err) {
        throw err
      })
  }
}
