import type { Frame, Locator, Page } from 'playwright'

export type ClientCommandTarget =
  | { kind: 'element'; id: string; deferred: boolean }
  | { kind: 'locator'; selector: string; description: string }

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
    if (
      (value.method !== 'click' &&
        value.method !== 'dblClick' &&
        value.method !== 'tripleClick' &&
        value.method !== 'hover' &&
        value.method !== 'clear' &&
        value.method !== 'selectOptions') ||
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
  target: ClientCommandTarget,
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
