import parseua from 'next/dist/compiled/ua-parser-js'
import { BOT_UA_RE } from '../../../shared/lib/router/utils/bots'

interface UserAgent {
  isBot: boolean
  ua: string
  browser: {
    name?: string
    version?: string
    major?: string
  }
  device: {
    model?: string
    type?: string
    vendor?: string
  }
  engine: {
    name?: string
    version?: string
  }
  os: {
    name?: string
    version?: string
  }
  cpu: {
    architecture?: string
  }
}

export function isBot(input: string): boolean {
  return BOT_UA_RE.test(input)
}

export function userAgentFromString(input: string | undefined): UserAgent {
  return {
    ...parseua(input),
    isBot: input === undefined ? false : isBot(input),
  }
}

export function userAgent({ headers }: { headers: Headers }): UserAgent {
  return userAgentFromString(headers.get('user-agent') || undefined)
}
