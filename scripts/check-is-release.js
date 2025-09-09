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

  const versionString = commitMsg.split(' ').pop().trim()
  const publishMsgRegex = /^v\d{1,}\.\d{1,}\.\d{1,}(-\w{1,}\.\d{1,})?$/
  const newPublishMsgRegex = /^Version Packages( \((canary|rc)\))?( \(#\d+\))?$/
  // When the "Version Packages" PR is merged, it may contain "\n"
  // in the message when co-authored, so split and get the first one.
  const newPublishPrMessage = commitMsg.split('\n')[0]

  if (publishMsgRegex.test(versionString)) {
    console.log(versionString)
    process.exit(0)
  } else if (newPublishMsgRegex.test(newPublishPrMessage)) {
    console.log('new-release')
    process.exit(0)
  } else {
    console.log('not publish commit', { commitId, commitMsg, versionString })
    process.exit(1)
  }
}

checkIsRelease()
