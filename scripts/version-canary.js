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
    await execa(
      `git remote set-url origin https://devjiwonchoi:${process.env.GITHUB_TOKEN}@github.com/devjiwonchoi/next.js.git`,
      { stdio: 'inherit', shell: true }
    )
    await execa(`git config user.name "devjiwonchoi"`, {
      stdio: 'inherit',
      shell: true,
    })
    await execa(`git config user.email "devjiwonchoi@gmail.com"`, {
      stdio: 'inherit',
      shell: true,
    })

    log('Pushing changes to canary branch...')
    await execa('git', ['add', '.'])
    await execa('git', [
      'commit',
      '-m',
      '[repo] bump package versions to canary',
    ])
    await execa('git', ['push', 'origin', 'HEAD:canary'])

    log('Canary release process completed successfully!')
  } catch (error) {
    console.error('Error during release process:', error)
    process.exit(1)
  }
}

main()
