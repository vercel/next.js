import type { ComponentType, createElement } from 'react'
import FixtureRoot from './fixture-root'

import { validateFixtureProps, type FixtureData } from './fixture-data'

/**
 * The App Page compiler binds the export, never a name received over HTTP.
 * Invoke using the page's RSC React instance; returning an element preserves
 * async component execution, request stores and Flight's client boundaries.
 * A provider is an explicitly authored wrapper export in the fixture module.
 */
export function createRegisteredFixtureElement(
  create: typeof createElement,
  fixture: unknown,
  props: unknown
) {
  validateFixtureProps(props)
  if (typeof fixture !== 'function') {
    throw new Error(
      'A registered server fixture must export a component function.'
    )
  }
  return create(fixture as ComponentType<Record<string, FixtureData>>, props)
}

/** Normal App Page inputs; these do not inherit an application's layouts. */
export type FixtureSearchParams = Record<string, string | string[] | undefined>

export async function renderRegisteredFixturePage(
  create: typeof createElement,
  fixture: unknown,
  searchParams: Promise<FixtureSearchParams>
) {
  const query = await searchParams
  const serialized = query.__nextFixtureProps
  if (typeof serialized !== 'string') {
    throw new Error(
      'A registered fixture requires exactly one __nextFixtureProps query value.'
    )
  }
  if (new TextEncoder().encode(serialized).byteLength > 64 * 1024) {
    throw new Error('Registered fixture props exceed the 64 KiB data limit.')
  }
  let props: unknown
  try {
    props = JSON.parse(serialized)
  } catch {
    // JSON parse diagnostics can contain user data. Do not reproduce them.
    throw new Error('Registered fixture props must contain valid JSON data.')
  }
  return create(
    FixtureRoot,
    null,
    createRegisteredFixtureElement(create, fixture, props)
  )
}
