const authToken = process.env.CODE_FREEZE_TOKEN

if (!authToken) {
  throw new Error(`missing CODE_FREEZE_TOKEN env`)
}

const codeFreezeRule = {
  context: 'Potentially publish release',
  app_id: 15368,
}

async function updateRules(newRules) {
  const res = await fetch(
    `https://api.github.com/repos/vercel/next.js/branches/canary/protection`,
    {
      method: 'PUT',
      headers: {
        Accept: 'application/vnd.github+json',
        Authorization: `Bearer ${authToken}`,
        'X-GitHub-Api-Version': '2022-11-28',
      },
      body: JSON.stringify(newRules),
    }
  )

  if (!res.ok) {
    throw new Error(
      `Failed to check for rule ${res.status} ${await res.text()}`
    )
  }
}

async function getCurrentRules() {
  const res = await fetch(
    `https://api.github.com/repos/vercel/next.js/branches/canary/protection`,
    {
      headers: {
        Accept: 'application/vnd.github+json',
        Authorization: `Bearer ${authToken}`,
        'X-GitHub-Api-Version': '2022-11-28',
      },
    }
  )

  if (!res.ok) {
    throw new Error(
      `Failed to check for rule ${res.status} ${await res.text()}`
    )
  }
  const data = await res.json()

  return {
    required_status_checks: {
      strict: data.required_status_checks.strict,
      // checks: data.required_status_checks.checks,
      contexts: data.required_status_checks.contexts,
    },
    enforce_admins: data.enforce_admins.enabled,
    required_pull_request_reviews: {
      dismiss_stale_reviews:
        data.required_pull_request_reviews.dismiss_stale_reviews,
      require_code_owner_reviews:
        data.required_pull_request_reviews.require_code_owner_reviews,
      require_last_push_approval:
        data.required_pull_request_reviews.require_last_push_approval,
      required_approving_review_count:
        data.required_pull_request_reviews.required_approving_review_count,
    },
    restrictions: {
      users: data.restrictions.users?.map((user) => user.login) || [],
      teams: data.restrictions.teams?.map((team) => team.slug) || [],
      apps: data.restrictions.apps?.map((app) => app.slug) || [],
    },
  }
}

async function main() {
  const typeIdx = process.argv.indexOf('--type')
  const type = process.argv[typeIdx + 1]

  if (type !== 'enable' && type !== 'disable') {
    throw new Error(`--type should be enable or disable`)
  }
  const isEnable = type === 'enable'
  const currentRules = await getCurrentRules()
  const hasRule = currentRules.required_status_checks.contexts?.some((ctx) => {
    return ctx === codeFreezeRule.context
  })

  console.log(currentRules)

  if (isEnable) {
    if (hasRule) {
      console.log(`Already enabled`)
      return
    }
    currentRules.required_status_checks.contexts.push(codeFreezeRule.context)
    await updateRules(currentRules)
    console.log('Enabled code freeze')
  } else {
    if (!hasRule) {
      console.log(`Already disabled`)
      return
    }
    currentRules.required_status_checks.contexts =
      currentRules.required_status_checks.contexts.filter(
        (ctx) => ctx !== codeFreezeRule.context
      )
    await updateRules(currentRules)
    console.log('Disabled code freeze')
  }
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
