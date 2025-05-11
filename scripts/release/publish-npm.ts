import execa from 'execa'

async function publishNpm() {
  const releaseType = process.env.RELEASE_TYPE
  const tag =
    releaseType === 'canary'
      ? 'canary'
      : releaseType === 'release-candidate'
        ? 'rc'
        : 'latest'

  await execa('pnpm', ['publish', '--recursive', '--tag', tag], {
    stdio: 'inherit',
  })
  // The tag will be pushed when changesets/action releases the GitHub Release.
  await execa('pnpm', ['changeset', 'tag'], {
    stdio: 'inherit',
  })
}

publishNpm()
