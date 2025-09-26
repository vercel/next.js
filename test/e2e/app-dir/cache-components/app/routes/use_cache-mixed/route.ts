import type { NextRequest } from 'next/server'

import { getSentinelValue } from '../../getSentinelValue'

export async function GET(request: NextRequest) {
  const messagea = await getCachedMessage('hello cached fast', 0)
  const messageb = await getMessage('hello uncached slow', 20)
  return new Response(
    JSON.stringify({
      value: getSentinelValue(),
      message1: messagea,
      message2: messageb,
    })
  )
}

async function getMessage(echo, delay) {
  const tag = ((Math.random() * 10000) | 0).toString(16)
  await new Promise((r) => setTimeout(r, delay))
  return `${tag}:${echo}`
}

async function getCachedMessage(echo, delay) {
  'use cache'
  return getMessage(echo, delay)
}
