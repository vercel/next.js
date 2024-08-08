import { info } from '@actions/core'
import { context } from '@actions/github'

async function main() {
  const issue = context.payload.issue
  info(`Issue: ${issue}`)
  info(`Issue: ${JSON.stringify(issue, null, 2)}`)
}

main()
