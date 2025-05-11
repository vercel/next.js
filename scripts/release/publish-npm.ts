import execa from 'execa'

async function publishNpm() {
  const releaseType = process.env.RELEASE_TYPE
  const tag =
    releaseType === 'canary'
      ? 'canary'
      : releaseType === 'release-candidate'
        ? 'rc'
        : 'latest'

  await execa('pnpm', ['changeset', 'publish', '--tag', tag], {
    stdio: 'inherit',
  })
}

publishNpm()
