'use client'

import { createServerActionRoutingKey } from '../shared/lib/server-action-routing-key'

export type ServerActionDispatchContext = {
  url: string
  nextUrl: string | null
}

const dispatchContextByRoutingKey = new Map<
  string,
  ServerActionDispatchContext
>()

function normalizeDispatchUrl(url: string | URL): string {
  const parsed = new URL(url, window.location.origin)
  return parsed.pathname + parsed.search
}

export function registerServerActionDispatchContext(
  actionRoutingKeys: readonly string[] | undefined,
  url: string | URL,
  nextUrl: string | null
): void {
  if (actionRoutingKeys === undefined || actionRoutingKeys.length === 0) {
    return
  }

  const normalizedUrl = normalizeDispatchUrl(url)
  const context = { url: normalizedUrl, nextUrl }

  for (const routingKey of actionRoutingKeys) {
    dispatchContextByRoutingKey.set(routingKey, context)
  }
}

export function getServerActionDispatchContext(
  actionId: string
): ServerActionDispatchContext | undefined {
  return dispatchContextByRoutingKey.get(createServerActionRoutingKey(actionId))
}
