import type { Frame, Locator, Page } from 'playwright'

export type ClientCommandTarget =
  | { kind: 'element'; id: string; deferred: boolean }
  | { kind: 'locator'; selector: string; description: string }
  | { kind: 'drag'; sourceSelector: string; targetSelector: string }

/** Decode target forms at the existing host command boundary. */
export function resolveClientCommandTarget(
  command: unknown
): ClientCommandTarget {
  const invalid = (): never => {
    throw new Error('Invalid Browser Mode element command.')
  }
  if (!command || typeof command !== 'object' || Array.isArray(command))
    return invalid()
  const value = command as Record<string, unknown>
  if (!Array.isArray(value.args)) return invalid()
  const hasLocator = 'locator' in value
  const hasElement = 'element' in value
  if (hasLocator === hasElement) return invalid()
  if (hasLocator) {
    if (value.method === 'dragAndDrop') {
      const source = value.locator as Record<string, unknown> | null
      const target = value.args[0] as Record<string, unknown> | null
      if (
        value.args.length < 1 ||
        value.args.length > 2 ||
        !source ||
        typeof source !== 'object' ||
        Array.isArray(source) ||
        !target ||
        typeof target !== 'object' ||
        Array.isArray(target) ||
        typeof source.selector !== 'string' ||
        typeof target.selector !== 'string'
      )
        return invalid()
      return {
        kind: 'drag',
        sourceSelector: source.selector,
        targetSelector: target.selector,
      }
    }
    if (
      (value.method !== 'click' &&
        value.method !== 'dblClick' &&
        value.method !== 'tripleClick' &&
        value.method !== 'hover' &&
        value.method !== 'clear' &&
        value.method !== 'fill' &&
        value.method !== 'selectOptions' &&
        value.method !== 'upload' &&
        value.method !== 'screenshot') ||
      !value.locator ||
      typeof value.locator !== 'object' ||
      Array.isArray(value.locator)
    )
      return invalid()
    const locator = value.locator as Record<string, unknown>
    if (
      typeof locator.selector !== 'string' ||
      typeof locator.locator !== 'string'
    )
      return invalid()
    return {
      kind: 'locator',
      selector: locator.selector,
      description: locator.locator,
    }
  }
  if (value.method === 'screenshot') return invalid()
  if (typeof value.element !== 'string') return invalid()
  const deferred = /^next-test-locator-[0-9]+$/.test(value.element)
  if (
    !/^next-test-element-[0-9]+$/.test(value.element) &&
    !(
      deferred &&
      [
        'click',
        'fill',
        'clear',
        'dblClick',
        'tripleClick',
        'hover',
        'unhover',
        'selectOptions',
      ].includes(value.method as string)
    )
  )
    return invalid()
  return { kind: 'element', id: value.element, deferred }
}

/** Use the actual serialized selector and provider action description. */
export function getClientCommandLocator(
  frame: Page | Frame,
  target: Exclude<ClientCommandTarget, { kind: 'drag' }>,
  locatorEngine: string
): Locator {
  const locator = frame.locator(
    target.kind === 'locator'
      ? target.selector
      : target.deferred
        ? locatorEngine + '=' + target.id
        : `[data-next-test-element="${target.id}"]`
  )
  return target.kind === 'locator' && typeof locator.describe === 'function'
    ? locator.describe(target.description)
    : locator
}
