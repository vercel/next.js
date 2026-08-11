'use client'

import { createServerActionRoutingKey } from '../shared/lib/server-action-routing-key'
import type { FlightRouterState } from '../shared/lib/app-router-types'
import { getLastCommittedTree } from './components/router-reducer/reducers/committed-state'

export type ServerActionDispatchContext = {
  url: string
  nextUrl: string | null
}

/**
 * React retains the `callServer` callback from a Flight decoder on every
 * Server Reference created by that decoder. The scope records the actions
 * supported by the response that produced the reference. At dispatch time,
 * the callback uses this together with the globally discovered routes to
 * select an active URL whose worker supports the action.
 *
 * Keep the routing keys as their original array. Segment decoders create many
 * short-lived scopes for the same route, so copying the keys into a Set would
 * multiply memory usage by the number of decoded segments.
 */
export type ServerActionDispatchScope = {
  context: ServerActionDispatchContext
  routingKeys: readonly string[]
}

type RegisteredServerActionDispatchContext = {
  context: ServerActionDispatchContext
  routingKeys: ReadonlySet<string>
}

const dispatchContextsByPathname = new Map<
  string,
  RegisteredServerActionDispatchContext[]
>()

function normalizeDispatchUrl(url: string | URL): string {
  const parsed = new URL(url, window.location.origin)
  return parsed.pathname + parsed.search
}

function getDispatchPathname(url: string): string {
  return new URL(url, window.location.origin).pathname
}

/**
 * Returns the URLs represented by the committed router tree in dispatch
 * priority order. The canonical URL is preferred; refresh URLs belong to
 * inactive parallel routes whose UI is still retained in the tree.
 */
function collectActiveDispatchUrls(tree: FlightRouterState | null): string[] {
  const canonicalUrl = normalizeDispatchUrl(window.location.href)
  const urls = [canonicalUrl]
  const seen = new Set(urls)

  if (tree === null) {
    return urls
  }

  function visitTree(currentTree: FlightRouterState): void {
    const refreshState = currentTree[2]
    if (refreshState !== undefined && refreshState !== null) {
      const refreshUrl = normalizeDispatchUrl(refreshState[0])
      if (!seen.has(refreshUrl)) {
        seen.add(refreshUrl)
        urls.push(refreshUrl)
      }
    }

    const parallelRoutes = currentTree[1]
    for (const parallelRouteKey in parallelRoutes) {
      visitTree(parallelRoutes[parallelRouteKey])
    }
  }

  visitTree(tree)
  return urls
}

function contextMatchesUrl(
  context: ServerActionDispatchContext,
  url: string
): boolean {
  return getDispatchPathname(context.url) === getDispatchPathname(url)
}

function findContextForUrl(
  url: string,
  routingKey: string,
  scopedContext: ServerActionDispatchContext | undefined,
  registeredContexts: RegisteredServerActionDispatchContext[] | undefined
): ServerActionDispatchContext | undefined {
  let pathnameMatch: ServerActionDispatchContext | undefined
  if (registeredContexts !== undefined) {
    for (const registeredContext of registeredContexts) {
      if (!registeredContext.routingKeys.has(routingKey)) {
        continue
      }
      const context = registeredContext.context
      if (context.url === url) {
        return context
      }
      if (pathnameMatch === undefined && contextMatchesUrl(context, url)) {
        pathnameMatch = context
      }
    }
  }

  // Search params do not affect which actions are bundled into a route. Use
  // the active URL's search params while retaining the route's Next-Url.
  if (scopedContext !== undefined && contextMatchesUrl(scopedContext, url)) {
    return scopedContext
  }

  return pathnameMatch
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
  const pathname = getDispatchPathname(normalizedUrl)
  const registeredContext = {
    context,
    routingKeys: new Set(actionRoutingKeys),
  }
  const contexts = dispatchContextsByPathname.get(pathname)
  if (contexts === undefined) {
    dispatchContextsByPathname.set(pathname, [registeredContext])
    return
  }

  const existingIndex = contexts.findIndex(
    (existingContext) => existingContext.context.nextUrl === nextUrl
  )
  if (existingIndex !== -1) {
    contexts.splice(existingIndex, 1)
  }
  contexts.unshift(registeredContext)
}

export function pruneServerActionDispatchContexts(
  tree: FlightRouterState
): void {
  // A registered route can only be a valid dispatch target while its URL is
  // represented by the committed tree. Drop discarded routes to keep the
  // client-side registry bounded as the user navigates.
  const activePathnames = new Set(
    collectActiveDispatchUrls(tree).map(getDispatchPathname)
  )

  for (const pathname of dispatchContextsByPathname.keys()) {
    if (!activePathnames.has(pathname)) {
      dispatchContextsByPathname.delete(pathname)
    }
  }
}

export function getServerActionDispatchContext(
  actionId: string,
  scope?: ServerActionDispatchScope
): ServerActionDispatchContext | undefined {
  const routingKey = createServerActionRoutingKey(actionId)
  const scopedContext = scope?.routingKeys.includes(routingKey)
    ? scope.context
    : undefined

  // Select the first active URL whose decoded response advertised support for
  // this action. This privileges the canonical URL before retained branches.
  for (const url of collectActiveDispatchUrls(getLastCommittedTree())) {
    const registeredContexts = dispatchContextsByPathname.get(
      getDispatchPathname(url)
    )
    const context = findContextForUrl(
      url,
      routingKey,
      scopedContext,
      registeredContexts
    )
    if (context !== undefined) {
      return { url, nextUrl: context.nextUrl }
    }
  }
}
