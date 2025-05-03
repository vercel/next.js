// @ts-check
const { exec, getTag } = require('./utils')

/** @param {boolean} isDryRun */
async function main(isDryRun) {
  const tag = getTag(process.cwd())
  console.log(`Publishing ${tag}`)

  // When running `pnpm recursive publish`, pnpm will
  // publish all the packages that have versions not
  // yet published to the registry.
  // x-ref: https://pnpm.io/9.x/cli/recursive
  //
  // This differs from running `pnpm publish --recursive`
  // where pnpm will try to publish ALL packages.
  let command = `pnpm recursive publish --tag ${tag}`

  if (isDryRun) {
    command += ' --dry-run'
  }

  try {
    await exec(command)
  } catch (err) {
    // TODO: Notify via Slack.
    console.error(err)
  }
}

// TODO: Uncomment when replacing legacy release.
// main()
module.exports = main
