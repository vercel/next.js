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
  await execa('pnpm', ['changeset', 'tag'], {
    stdio: 'inherit',
  })
}

publishNpm()
