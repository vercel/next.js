import {
  Children,
  Fragment,
  Suspense,
  isValidElement,
  type ReactNode,
} from 'react'
import type { ClientReferenceObserver } from './client-references'
import type {
  ObservedClientReference,
  ServerOutputNode,
  ClientBoundaryObservation,
  ServerSubtreeObservation,
} from './types'
export type {
  ServerOutputNode,
  ClientBoundaryObservation,
  ServerSubtreeObservation,
} from './types'

function isThenable(value: unknown): value is PromiseLike<unknown> {
  return (
    value !== null &&
    (typeof value === 'object' || typeof value === 'function') &&
    typeof (value as PromiseLike<unknown>).then === 'function'
  )
}

async function waitForThenable(
  value: PromiseLike<unknown>,
  signal: AbortSignal
) {
  signal.throwIfAborted()
  await new Promise<void>((resolve, reject) => {
    const abort = () => reject(signal.reason)
    signal.addEventListener('abort', abort, { once: true })
    Promise.resolve(value).then(
      () => {
        signal.removeEventListener('abort', abort)
        resolve()
      },
      (error) => {
        signal.removeEventListener('abort', abort)
        reject(error)
      }
    )
  })
  signal.throwIfAborted()
}

/**
 * Resolve only the matching Flight decoder's lazy element-type protocol. In the
 * pinned React decoder createLazyChunkWrapper uses _init(_payload) to read its
 * real module chunk, potentially throwing that chunk's thenable. Do not emulate
 * chunk states or invoke the returned component. Stop at a known export first,
 * preserving authored memo/lazy wrapper identity instead of initializing it.
 */
async function resolveClientType(
  initial: unknown,
  references: ClientReferenceObserver,
  signal: AbortSignal
): Promise<ObservedClientReference[]> {
  let type = initial
  const visited = new Set<object>()
  while (true) {
    signal.throwIfAborted()
    const candidates = references.referencesFor(type)
    if (candidates.length > 0) return candidates
    if (
      !type ||
      typeof type !== 'object' ||
      Reflect.get(type, '$$typeof') !== Symbol.for('react.lazy')
    ) {
      throw new Error(
        'Decoded component type has no observed SSR manifest identity. Use browser integration for unsupported component types.'
      )
    }
    const init = Reflect.get(type, '_init')
    if (
      typeof init !== 'function' ||
      !Object.prototype.hasOwnProperty.call(type, '_payload') ||
      visited.has(type)
    ) {
      throw new Error('Unsupported or cyclic decoded React lazy type.')
    }
    try {
      const resolved = init(Reflect.get(type, '_payload'))
      visited.add(type)
      type = resolved
    } catch (error) {
      if (!isThenable(error)) throw error
      await waitForThenable(error, signal)
    }
  }
}

/** Runs in the matching SSR consumer, never a host copy of React. */
export async function observeServerTree(
  model: unknown,
  references: ClientReferenceObserver,
  signal: AbortSignal
): Promise<ServerSubtreeObservation> {
  const clientBoundaries: ClientBoundaryObservation[] = []
  let text = ''

  async function visit(
    value: unknown,
    includeText: boolean
  ): Promise<ServerOutputNode[]> {
    signal.throwIfAborted()
    if (typeof value === 'function' || typeof value === 'symbol') {
      throw new Error(
        'Unsupported function or symbol in decoded server output.'
      )
    }
    let children: ReturnType<typeof Children.toArray>
    while (true) {
      try {
        // React resolves its own lazy/thenable children here. Do not inspect
        // private Flight rows, React lazy payloads, or call element types.
        children = Children.toArray(value as ReactNode)
        break
      } catch (error) {
        if (isThenable(error)) {
          await waitForThenable(error, signal)
        } else {
          throw error
        }
      }
    }
    const nodes: ServerOutputNode[] = []
    for (const child of children) {
      signal.throwIfAborted()
      if (
        typeof child === 'string' ||
        typeof child === 'number' ||
        typeof child === 'bigint'
      ) {
        if (references.referencesFor(child).length > 0) {
          throw new Error(
            'A primitive client export is indistinguishable from server text in decoded output. Use browser integration.'
          )
        }
        const childText = String(child)
        nodes.push({ kind: 'text', value: childText })
        if (includeText) text += childText
        continue
      }
      if (!isValidElement<Record<string, unknown>>(child)) {
        throw new Error('Unsupported value in decoded server output.')
      }
      const { children: nested, ...props } = child.props
      if (typeof child.type === 'string') {
        if (references.referencesFor(child.type).length > 0) {
          throw new Error(
            'A primitive client export is indistinguishable from a host element in decoded output. Use browser integration.'
          )
        }
        nodes.push({
          kind: 'element',
          tag: child.type,
          props,
          children: await visit(nested, includeText),
        })
      } else if (child.type === Fragment) {
        if (references.referencesFor(child.type).length > 0) {
          throw new Error(
            'A client export is indistinguishable from a built-in Fragment in decoded output. Use browser integration.'
          )
        }
        nodes.push({
          kind: 'fragment',
          children: await visit(nested, includeText),
        })
      } else if (child.type === Suspense) {
        if (references.referencesFor(child.type).length > 0) {
          throw new Error(
            'A client export is indistinguishable from built-in Suspense in decoded output. Use browser integration.'
          )
        }
        nodes.push({
          kind: 'suspense',
          children: await visit(nested, includeText),
          fallback: await visit(props.fallback, false),
        })
      } else {
        if (
          child.type === null ||
          (typeof child.type !== 'function' && typeof child.type !== 'object')
        ) {
          throw new Error('Unsupported React type in decoded server output.')
        }
        const candidates = await resolveClientType(
          child.type,
          references,
          signal
        )
        const boundary: ClientBoundaryObservation = {
          kind: 'client-boundary',
          references: candidates,
          props: child.props,
        }
        clientBoundaries.push(boundary)
        nodes.push(boundary)
      }
    }
    return nodes
  }

  const tree = await visit(model, true)
  return { tree, text, clientBoundaries }
}
