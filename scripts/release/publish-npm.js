// @ts-check
const path = require('path')
const { exec } = require('./utils')

async function getTag() {
  let isCanary = true
  let isReleaseCandidate = false

  try {
    const tagOutput = await exec(
      `node ${path.join(__dirname, 'check-is-release.js')}`
    )
    console.log({ tagOutput })

    if (tagOutput.trim().startsWith('v')) {
      isCanary = tagOutput.includes('-canary')
    }
    isReleaseCandidate = tagOutput.includes('-rc')
  } catch (err) {
    console.log(err)

    if (err.message && err.message.includes('no tag exactly matches')) {
      console.log('Nothing to publish, exiting...')
      process.exit(0)
    }
    throw err
  }
  console.log(
    `Publishing ${isCanary ? 'canary' : isReleaseCandidate ? 'rc' : 'stable'}`
  )

  if (isCanary) {
    return 'canary'
  }
  if (isReleaseCandidate) {
    return 'rc'
  }
}

async function main() {
  const tag = await getTag()
  await exec(`pnpm publish --recursive --tag ${tag}`)
}

// TODO: Uncomment when replacing legacy release.
// main()
module.exports = main
