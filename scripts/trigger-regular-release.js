const execa = require('execa')

async function main() {
  try {
    // Exit pre mode if we're in it
    console.log('Exiting pre mode...')
    await execa('pnpm', ['changeset', 'pre', 'exit'], {
      stdio: 'inherit',
    })

    // Version packages
    console.log('Versioning packages...')
    await execa('pnpm', ['changeset', 'version'], {
      stdio: 'inherit',
    })

    // Install dependencies
    console.log('Installing dependencies...')
    await execa('pnpm', ['install'], {
      stdio: 'inherit',
    })

    // Enter canary pre mode
    console.log('Entering canary pre mode...')
    await execa('pnpm', ['changeset', 'pre', 'enter', 'canary'], {
      stdio: 'inherit',
    })

    console.log('Regular release process completed successfully')
  } catch (error) {
    console.error('Error during release process:', error)
    process.exit(1)
  }
}

main()
