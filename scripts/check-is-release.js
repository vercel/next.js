const { execSync } = require('child_process')

const checkIsRelease = async () => {
  let commitId = process.argv[2] || ''

  // parse only the last string which should be version if
  // it's a publish commit
  const commitMsg = execSync(
    `git log -n 1 --pretty='format:%B'${commitId ? ` ${commitId}` : ''}`
  )
    .toString()
    .trim()

  // "Version Packages" or "Version Packages (dry)"
  const newReleaseMsgRegex = /^Version Packages( \(dry\))?$/
  const isNewRelease = newReleaseMsgRegex.test(commitMsg)
  if (isNewRelease) {
    console.log('New release process is in action, skipping...')
    process.exit(0)
  }

  const versionString = commitMsg.split(' ').pop().trim()
  const publishMsgRegex = /^v\d{1,}\.\d{1,}\.\d{1,}(-\w{1,}\.\d{1,})?$/

  if (publishMsgRegex.test(versionString)) {
    console.log(versionString)
    process.exit(0)
  } else {
    console.log('not publish commit', { commitId, commitMsg, versionString })
    process.exit(1)
  }
}

checkIsRelease()
