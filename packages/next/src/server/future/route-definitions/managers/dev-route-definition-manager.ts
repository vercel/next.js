import type { RouteDefinition } from '../route-definition'
import type { RouteDefinitionProvider } from '../providers/route-definition-provider'

import path from 'path'
import * as Log from '../../../../build/output/log'
import { BaseRouteDefinitionManager } from './base-route-definition-manager'
import chalk from 'next/dist/compiled/chalk'

export class DevRouteDefinitionManager extends BaseRouteDefinitionManager {
  constructor(
    private readonly dir: string,
    providers: ReadonlyArray<RouteDefinitionProvider>
  ) {
    super(providers)
  }

  protected async loader(): Promise<boolean> {
    // Call the underlying loader.
    const changed = await super.loader()

    // If the definitions have not changed, then we don't need to do anything.
    if (!changed) return false

    // These are new definitions, let's try to find any duplicates.
    const all = new Map<string, RouteDefinition[]>()
    const duplicates = new Map<string, RouteDefinition[]>()
    for (const definition of this.definitions) {
      // Let's see if this pathname has already been seen. If it has, then it's
      // a duplicate.
      let matched = all.get(definition.pathname)

      // If there wasn't a match or there was but there were no matches, then
      // this is the first time we've seen this pathname.
      if (!matched || matched.length === 0) {
        matched = [definition]
        all.set(definition.pathname, matched)
        continue
      }

      // We got a duplicate! This means that along with the current
      // definition, there is already a definition for the same pathname. Let's
      // grab the first one, as all the definitions will share the same
      // array reference anyways.
      const [other] = matched

      // Check to see if this there is already a duplicate array for this
      // pathname. If there is, then we can just push the definition into it.
      // Otherwise, we need to create a new array with the original
      // duplicate first.
      let others = duplicates.get(definition.pathname)
      if (!others) {
        // There was no duplicate array, so create a new one with the
        // original duplicate first. Then add this array reference to the
        // duplicates map.
        others = [other]
        duplicates.set(definition.pathname, others)
      }

      // Push the new definition into the array of duplicates and set the
      // array reference on the new definition. This is the first time it's
      // been duplicated.
      others.push(definition)
      matched.push(definition)
    }

    if (duplicates.size === 0) {
      this.debug('no duplicates found')
      return true
    }

    this.debug('found %d duplicates', duplicates.size)

    // Warn about the duplicates if they do
    for (const [pathname, definitions] of duplicates.entries()) {
      const [{ identity }, ...others] = definitions

      // We only want to warn about definitions resolving to the same path if their
      // identities are different.
      if (others.some((definition) => definition.identity !== identity)) {
        continue
      }

      Log.warn(
        `Duplicate page detected. ${definitions
          .map((definition) =>
            chalk.cyan(path.relative(this.dir, definition.filename))
          )
          .join(' and ')} resolve to ${chalk.cyan(pathname)}`
      )
    }

    return true
  }
}
