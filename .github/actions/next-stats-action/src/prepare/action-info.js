const path = require('path')
const logger = require('../util/logger')
const { execSync } = require('child_process')
const releaseTypes = new Set(['release', 'published'])

module.exports = function actionInfo() {
  let {
    ISSUE_ID,
    SKIP_CLONE,
    GITHUB_REF,
    LOCAL_STATS,
    GIT_ROOT_DIR,
    GITHUB_ACTION,
    COMMENT_ENDPOINT,
    GITHUB_REPOSITORY,
    GITHUB_EVENT_PATH,
    PR_STATS_COMMENT_TOKEN,
  } = process.env

  delete process.env.GITHUB_TOKEN
  delete process.env.PR_STATS_COMMENT_TOKEN

  // only use custom endpoint if we don't have a token
  const commentEndpoint = !PR_STATS_COMMENT_TOKEN && COMMENT_ENDPOINT

  if (LOCAL_STATS === 'true') {
    const cwd = process.cwd()
    const parentDir = path.join(cwd, '../..')

    if (!GITHUB_REF) {
      // get the current branch name
      GITHUB_REF = execSync(`cd "${cwd}" && git rev-parse --abbrev-ref HEAD`)
        .toString()
        .trim()
    }
    if (!GIT_ROOT_DIR) {
      GIT_ROOT_DIR = path.join(parentDir, '/')
    }
    if (!GITHUB_REPOSITORY) {
      GITHUB_REPOSITORY = path.relative(parentDir, cwd)
    }
    if (!GITHUB_ACTION) {
      GITHUB_ACTION = 'opened'
    }
  }

  const info = {
    commentEndpoint,
    skipClone: SKIP_CLONE,
    actionName: GITHUB_ACTION,
    githubToken: PR_STATS_COMMENT_TOKEN,
    customCommentEndpoint: !!commentEndpoint,
    gitRoot: GIT_ROOT_DIR || 'https://github.com/',
    prRepo: GITHUB_REPOSITORY,
    prRef: GITHUB_REF,
    isLocal: LOCAL_STATS,
    commitId: null,
    issueId: ISSUE_ID,
    isRelease:
      GITHUB_REPOSITORY === 'vercel/next.js' &&
      (GITHUB_REF || '').includes('canary'),
  }

  if (info.isRelease) {
    info.prRef = 'canary'
  }

  // get comment
  if (GITHUB_EVENT_PATH) {
    const event = require(GITHUB_EVENT_PATH)
    info.actionName = event.action || info.actionName

    if (releaseTypes.has(info.actionName)) {
      info.isRelease = true
    } else {
      // since GITHUB_REPOSITORY and REF might not match the fork
      // use event data to get repository and ref info
      const prData = event['pull_request']

      if (prData) {
        info.prRepo = prData.head.repo.full_name
        info.prRef = prData.head.ref
        info.issueId = prData.number

        if (!info.commentEndpoint) {
          info.commentEndpoint = prData._links.comments || ''
        }
        // comment endpoint might be under `href`
        if (typeof info.commentEndpoint === 'object') {
          info.commentEndpoint = info.commentEndpoint.href
        }
      }
    }
  }

  logger('Got actionInfo:')
  logger.json({
    ...info,
    githubToken: PR_STATS_COMMENT_TOKEN ? 'found' : 'missing',
  })

  return info
}
