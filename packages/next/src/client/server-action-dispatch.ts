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
const routingKeyByActionId = new Map<string, Promise<string>>()

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

export async function getServerActionDispatchContext(
  actionId: string
): Promise<ServerActionDispatchContext> {
  let routingKey = routingKeyByActionId.get(actionId)
  if (routingKey === undefined) {
    routingKey = createServerActionRoutingKey(actionId)
    routingKeyByActionId.set(actionId, routingKey)
  }

  const dispatchContext = dispatchContextByRoutingKey.get(await routingKey)
  if (dispatchContext === undefined) {
    throw new Error(
      'Invariant: Missing Server Action dispatch context. This indicates that the action routing metadata was not registered for this action.'
    )
  }

  return dispatchContext
}
