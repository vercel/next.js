import { info } from '@actions/core'
import { context } from '@actions/github'

async function main() {
  if (context.eventName === 'issues' && context.payload.action === 'opened') {
    const issue = context.payload.issue
    info(`Issue: ${JSON.stringify(issue)}`)
  }
}

main()
