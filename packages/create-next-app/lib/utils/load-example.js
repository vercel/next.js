const Promise = require('promise')
const got = require('got')
const mkdir = require('make-dir')
const tar = require('tar')
const Octokit = require('@octokit/rest')
const output = require('./output')

// Ensure the given `example` name has a package.json file
// A "not found" error will be returned if not
const validateExampleName = example =>
  new Octokit().repos.getContent({
    owner: 'zeit',
    repo: 'next.js',
    path: `examples/${example}/package.json`
  })

// Stream and untar the archive, keeping only the requested example
const fetchAndExtract = ({ projectName, example }) =>
  new Promise((resolve, reject) => {
    got
      .stream('https://codeload.github.com/zeit/next.js/tar.gz/canary')
      .on('error', reject)
      .pipe(
        tar.extract(
          {
            // Extract to the project name
            cwd: projectName,
            // Strip the first 3 dirs
            strip: 3
          },
          [
            // We only care about this dir
            `next.js-canary/examples/${example}`
          ]
        )
      )
      .on('error', reject)
      .on('end', () => resolve())
  })

module.exports = function loadExample (opts) {
  const { projectName, example } = opts
  const stopExampleSpinner = output.wait(
    `Downloading files for ${output.cmd(example)} example`
  )
  return validateExampleName(example)
    .then(() => mkdir(projectName))
    .then(() => fetchAndExtract({ projectName, example }))
    .then(() => {
      stopExampleSpinner()
      output.success(
        `Downloaded ${output.cmd(example)} files for ${output.cmd(projectName)}`
      )
    })
    .catch(err => {
      stopExampleSpinner()
      output.error(
        `Error downloading ${output.cmd(example)} files for ${output.cmd(
          projectName
        )}`
      )
      throw err
    })
}
