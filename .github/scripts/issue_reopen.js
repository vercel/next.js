const REOPEN_WINDOW_MS = 14 * 24 * 60 * 60 * 1000

async function handleIssueReopening({ core, github, context }) {
  const { owner, repo } = context.repo
  const eventIssue = context.payload.issue
  const issueParams = {
    owner,
    repo,
    issue_number: eventIssue.number,
  }

  function isAutomationUser(user) {
    const login = user?.login?.toLowerCase()

    return (
      !login ||
      user.type === 'Bot' ||
      login.endsWith('[bot]') ||
      login.endsWith('-bot')
    )
  }

  async function hasTriagePermission(user) {
    if (user?.type !== 'User' || isAutomationUser(user)) return false

    try {
      const { data } = await github.rest.repos.getCollaboratorPermissionLevel({
        owner,
        repo,
        username: user.login,
      })

      const eligibleRoles = new Set(['triage', 'write', 'maintain', 'admin'])

      return (
        data.user?.permissions?.triage === true ||
        eligibleRoles.has(data.role_name) ||
        eligibleRoles.has(data.permission)
      )
    } catch (error) {
      if (error.status === 404) return false
      throw error
    }
  }

  async function getIssue() {
    const { data } = await github.rest.issues.get(issueParams)
    return data
  }

  async function getTimeline() {
    return github.paginate(github.rest.issues.listEventsForTimeline, {
      ...issueParams,
      per_page: 100,
    })
  }

  function findCurrentClosureIndex(timeline, issue) {
    for (let index = timeline.length - 1; index >= 0; index--) {
      const event = timeline[index]

      if (
        event.event === 'closed' &&
        event.created_at === issue.closed_at &&
        event.actor?.id === issue.closed_by?.id
      ) {
        return index
      }
    }

    return -1
  }

  if (context.eventName === 'issues') {
    const issue = await getIssue()

    if (
      issue.state !== 'closed' ||
      issue.locked ||
      issue.pull_request ||
      issue.closed_at !== eventIssue.closed_at ||
      issue.closed_by?.id !== context.payload.sender?.id
    ) {
      core.info('Skipping a stale, open, locked, or non-issue closure')
      return
    }

    if (!(await hasTriagePermission(issue.closed_by))) {
      core.info('Skipping a closure not performed by a maintainer')
      return
    }

    const timeline = await getTimeline()
    const closureIndex = findCurrentClosureIndex(timeline, issue)

    if (closureIndex === -1) {
      core.info('Skipping a closure missing from the issue timeline')
      return
    }

    const marker = `<!-- issue-reopen-window:${timeline[closureIndex].id} -->`
    const markerSearchSince = new Date(
      Date.parse(issue.closed_at) - 1000
    ).toISOString()
    const comments = await github.paginate(github.rest.issues.listComments, {
      ...issueParams,
      since: markerSearchSince,
      per_page: 100,
    })

    const alreadyCommented = comments.some(
      (comment) =>
        comment.user?.login === 'github-actions[bot]' &&
        comment.body?.includes(marker)
    )

    if (alreadyCommented) {
      core.info('The reopening instructions were already posted')
      return
    }

    const body = `This issue was closed by a maintainer. If you think it was closed by mistake, you can request that it be reopened within the next 14 days.

Reply with \`Reopen: <reason>\` and explain why the issue is still relevant. If you opened this issue or commented before it was closed, the issue will be reopened automatically.

After 14 days, please open a new issue with up-to-date details and a reproduction, when applicable.

${marker}`

    await github.rest.issues.createComment({
      ...issueParams,
      body,
    })

    core.info(`Posted reopening instructions on issue #${issue.number}`)
    return
  }

  const comment = context.payload.comment
  const command = comment?.body?.match(/^\s*reopen\s*:\s*(\S[\s\S]*)$/i)

  if (!comment || isAutomationUser(comment.user) || !command) {
    core.info('Skipping an invalid reopening request')
    return
  }

  const issue = await getIssue()

  if (issue.state !== 'closed' || issue.locked || issue.pull_request) {
    core.info('Skipping a request for an open, locked, or non-issue')
    return
  }

  const closedAt = Date.parse(issue.closed_at)
  const requestedAt = Date.parse(comment.created_at)

  if (
    !Number.isFinite(closedAt) ||
    !Number.isFinite(requestedAt) ||
    requestedAt < closedAt ||
    requestedAt - closedAt > REOPEN_WINDOW_MS
  ) {
    core.info('Skipping a reopening request outside the 14-day window')
    return
  }

  if (!(await hasTriagePermission(issue.closed_by))) {
    core.info('Skipping a request for a non-maintainer closure')
    return
  }

  const requesterId = comment.user.id
  let isParticipant = issue.user?.id === requesterId

  if (!isParticipant) {
    const timeline = await getTimeline()
    const closureIndex = findCurrentClosureIndex(timeline, issue)

    if (closureIndex === -1) {
      core.info('Skipping a request missing its closure timeline event')
      return
    }

    isParticipant = timeline
      .slice(0, closureIndex)
      .some(
        (event) => event.event === 'commented' && event.user?.id === requesterId
      )
  }

  if (!isParticipant) {
    core.info('Skipping a request from someone who did not participate')
    return
  }

  const latestIssue = await getIssue()

  if (
    latestIssue.state !== 'closed' ||
    latestIssue.locked ||
    latestIssue.closed_at !== issue.closed_at ||
    latestIssue.closed_by?.id !== issue.closed_by?.id
  ) {
    core.info('Skipping a request because the issue state changed')
    return
  }

  await github.rest.issues.update({
    ...issueParams,
    state: 'open',
    state_reason: 'reopened',
  })

  core.info(`Reopened issue #${issue.number}`)
}

module.exports = { handleIssueReopening }
