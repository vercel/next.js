const execa = require('execa')

const log = (...args) => {
  console.log('▲  ', ...args)
}

async function main() {
  try {
    log('Starting version-stable script...')

    // Exit pre mode if we're in it
    log('Exiting pre mode...')
    await execa('pnpm', ['changeset', 'pre', 'exit'], {
      stdio: 'inherit',
    })

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

    // Enter canary pre mode
    log('Entering canary pre mode...')
    await execa('pnpm', ['changeset', 'pre', 'enter', 'canary'], {
      stdio: 'inherit',
    })

    log('Stable release process completed successfully!')
  } catch (error) {
    console.error('Error during release process:', error)
    process.exit(1)
  }
}

main()
