'use client'

import { createServerActionRoutingKey } from '../shared/lib/server-action-routing-key'

export type ServerActionDispatchContext = {
  url: string
  nextUrl: string | null
}

/**
 * React retains the `callServer` callback from a Flight decoder on every
 * Server Reference created by that decoder. This scope lets the callback
 * prefer the URL that produced the reference, but only when that response
 * advertised ownership of the action. References to actions owned by another
 * worker still fall back to the global routing map.
 *
 * Keep the routing keys as their original array. Segment decoders create many
 * short-lived scopes for the same route, so copying the keys into a Set would
 * multiply memory usage by the number of decoded segments.
 */
export type ServerActionDispatchScope = {
  context: ServerActionDispatchContext
  routingKeys: readonly string[]
}

const dispatchContextByRoutingKey = new Map<
  string,
  ServerActionDispatchContext
>()

function normalizeDispatchUrl(url: string | URL): string {
  const parsed = new URL(url, window.location.origin)
  return parsed.pathname + parsed.search
}

export function createServerActionDispatchScope(
  url: string | URL,
  nextUrl: string | null,
  routingKeys?: readonly string[] | null
): ServerActionDispatchScope {
  return {
    context: { url: normalizeDispatchUrl(url), nextUrl },
    routingKeys: routingKeys ?? [],
  }
}

export function setServerActionDispatchScopeContext(
  scope: ServerActionDispatchScope,
  url: string | URL,
  nextUrl: string | null
): void {
  scope.context = { url: normalizeDispatchUrl(url), nextUrl }
}

export function setServerActionDispatchScopeRoutingKeys(
  scope: ServerActionDispatchScope,
  routingKeys: readonly string[] | undefined
): void {
  scope.routingKeys = routingKeys ?? []
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
  actionId: string,
  scope?: ServerActionDispatchScope
): ServerActionDispatchContext | undefined {
  const routingKey = createServerActionRoutingKey(actionId)
  if (scope?.routingKeys.includes(routingKey)) {
    return scope.context
  }
  return dispatchContextByRoutingKey.get(routingKey)
}
