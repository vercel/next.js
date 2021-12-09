import { execSync } from 'child_process'
import execa from 'execa'
;(async () => {
  let commitId = process.argv[process.argv.length - 1]

  if (commitId.endsWith('fetch-tags.mjs')) {
    commitId = ''
  }

  // <hash> (<tag>) <message>
  // parse only the last string which should be version if
  // it's a publish commit
  const commitMsg = execSync(
    `git log --oneline -n 1 ${commitId ? ` ${commitId}` : ''}`
  )
    .toString()
    .trim()
  const versionString = commitMsg.split(' ').pop().trim()
  const publishMsgRegex = /^v\d{1,}\.\d{1,}\.\d{1,}(-\w{1,}\.\d{1,})?$/

  console.log({ commitId, commitMsg, versionString })

  if (publishMsgRegex.test(versionString)) {
    console.log('publish commit, fetching tags')

    const result = await execa(
      'git',
      ['fetch', '--depth=1', 'origin', '+refs/tags/*:refs/tags/*'],
      {
        stdio: ['ignore', 'inherit', 'inherit'],
        env: {
          ...process.env,
        },
      }
    )

    if (result.exitCode !== 0) {
      throw new Error(
        `Failed to fetch tags, exited with code ${result.exitCode}`
      )
    }
  } else {
    console.log('not publish commit')
  }
})()
