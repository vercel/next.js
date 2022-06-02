import { execSync } from 'child_process'
import execa from 'execa'
;(async () => {
  let commitId = process.argv[2] || ''

  // parse only the last string which should be version if
  // it's a publish commit
  const commitMsg = execSync(
    `git log -n 1 --pretty='format:%B'${commitId ? ` ${commitId}` : ''}`
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
      }
    )

    process.exit(result.exitCode)
  } else {
    console.log('not publish commit')
  }
})()
