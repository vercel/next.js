async function deliverOneVerifiedClose({ core, github }) {
  const queue =
    'https://next-maintainer-agent.vercel.tools/eve/agents/close-verifier/eve/v1/auto-close'
  const repository = 'vercel/next.js'
  const [owner, repo] = repository.split('/')

  async function queueRequest(path, body) {
    const token = await core.getIDToken('next-maintainer-auto-close')
    core.setSecret(token)
    const response = await fetch(`${queue}${path}`, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${token}`,
        'x-vercel-trusted-oidc-idp-token': token,
        ...(body === undefined ? {} : { 'content-type': 'application/json' }),
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      redirect: 'error',
      signal: AbortSignal.timeout(15_000),
    })
    if (response.status === 204) return null
    const text = await response.text()
    if (!response.ok)
      throw new Error(
        `Queue returned ${response.status}: ${text.slice(0, 300)}`
      )
    return text.length === 0 ? null : JSON.parse(text)
  }

  async function report(claim, outcome, error) {
    await queueRequest(`/${encodeURIComponent(claim.approvalId)}/delivery`, {
      leaseToken: claim.leaseToken,
      outcome,
      ...(error === undefined ? {} : { error: error.slice(0, 2_000) }),
    })
  }

  async function reportStale(claim, message) {
    core.warning(message)
    await report(claim, 'stale', message)
  }

  async function readIssue(number) {
    try {
      const issue = (
        await github.rest.issues.get({ owner, repo, issue_number: number })
      ).data
      if (
        issue.number !== number ||
        issue.repository_url !== `https://api.github.com/repos/${repository}`
      ) {
        return null
      }
      return issue
    } catch (error) {
      if (error?.status === 404 || error?.status === 410) return null
      throw error
    }
  }

  const claimed = await queueRequest('/claim')
  if (claimed === null) return
  const claim = claimed
  const marker = `<!-- next-maintainer-auto-close:${claim.approvalId} -->`

  try {
    const issue = await readIssue(claim.issueNumber)
    if (issue === null) {
      await reportStale(claim, 'Issue no longer exists in this repository.')
      return
    }
    if (issue.pull_request !== undefined) {
      await reportStale(claim, 'Target is a pull request.')
      return
    }

    const comments = await github.paginate(github.rest.issues.listComments, {
      owner,
      repo,
      issue_number: claim.issueNumber,
      per_page: 100,
    })
    const markerComment = comments.find((comment) =>
      (comment.body ?? '').includes(marker)
    )

    if (issue.state === 'closed') {
      if (markerComment === undefined) {
        await reportStale(claim, 'Issue was closed independently.')
      } else {
        await report(claim, 'closed')
      }
      return
    }
    if (markerComment !== undefined) {
      // This is either a partial prior run or a human reopen. Leave it open.
      await reportStale(claim, 'Issue is open after a prior delivery comment.')
      return
    }

    let duplicateIssueId
    if (claim.stateReason === 'duplicate') {
      if (claim.duplicateIssueNumber === claim.issueNumber) {
        await reportStale(claim, 'Issue cannot be a duplicate of itself.')
        return
      }
      const canonical = await readIssue(claim.duplicateIssueNumber)
      if (canonical === null || canonical.pull_request !== undefined) {
        await reportStale(
          claim,
          'Duplicate target is not an issue in this repository.'
        )
        return
      }
      duplicateIssueId = canonical.id
    }

    await github.rest.issues.createComment({
      owner,
      repo,
      issue_number: claim.issueNumber,
      body: `${claim.closeComment}\n\n${marker}`,
    })

    const updated = (
      await github.rest.issues.update({
        owner,
        repo,
        issue_number: claim.issueNumber,
        state: 'closed',
        state_reason: claim.stateReason,
        ...(duplicateIssueId === undefined
          ? {}
          : { duplicate_issue_id: duplicateIssueId }),
      })
    ).data
    if (
      updated.state !== 'closed' ||
      updated.state_reason !== claim.stateReason
    ) {
      throw new Error('GitHub did not apply the requested close reason.')
    }
    await report(claim, 'closed')
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    try {
      await report(claim, 'retry', message)
    } catch (callbackError) {
      core.warning(`Could not report retry: ${callbackError}`)
    }
    throw error
  }
}

module.exports = { deliverOneVerifiedClose }
