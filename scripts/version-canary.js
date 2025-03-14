const execa = require('execa')

const log = (...args) => {
  console.log('▲  ', ...args)
}

async function main() {
  try {
    log('Starting version-canary script...')

    // Version packages
    log('Versioning packages...')
    await execa('pnpm', ['changeset', 'version'], {
      stdio: 'inherit',
    })

    // Update lockfile
    log('Updating lockfile...')
    // --frozen-lockfile is enabled by default in CI, so explicitly
    // disable it.
    await execa('pnpm', ['install', '--no-frozen-lockfile'], {
      stdio: 'inherit',
    })

    log('Configuring the release bot...')
    await execa('git', ['config', 'user.name', 'github-actions[bot]'])
    await execa('git', [
      'config',
      'user.email',
      '41898282+github-actions[bot]@users.noreply.github.com',
    ])

    log('Pushing changes to canary branch...')
    await execa('git', ['add', '.'])
    await execa('git', ['commit', '-m', '"[repo] version packages to canary"'])
    await execa('git', ['push', 'origin', 'HEAD:canary'])

    log('Canary release process completed successfully!')
  } catch (error) {
    console.error('Error during release process:', error)
    process.exit(1)
  }
}

main()
