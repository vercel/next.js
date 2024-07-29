import { info } from '@actions/core'
import { context } from '@actions/github'

async function main() {
  const payload = context.payload

  info(`Payload: ${JSON.stringify(payload)}`)
}

main()
