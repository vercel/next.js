import { checkIsNewRelease, exec, getTag } from './utils'

export default async function publishNpm(): Promise<void> {
  const { isDryRun } = checkIsNewRelease()
  const tag = getTag(process.cwd())
  console.log(`Publishing ${tag}`)

  // When running `pnpm recursive publish`, pnpm will
  // publish all the packages that have versions not
  // yet published to the registry.
  // x-ref: https://pnpm.io/9.x/cli/recursive
  //
  // This differs from running `pnpm publish --recursive`
  // where pnpm will try to publish ALL packages.
  let command = `pnpm recursive publish`

  if (tag) {
    command += ` --tag ${tag}`
  }

  if (isDryRun) {
    command += ' --dry-run'
  }

  try {
    await exec(command)
  } catch (err) {
    // TODO: Notify via Slack.
    console.error(err)
    process.exit(1)
  }
}

publishNpm()
