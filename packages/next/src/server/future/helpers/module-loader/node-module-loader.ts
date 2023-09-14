import { ModuleLoader } from './module-loader'

/**
 * Loads a module using `await require(id)`.
 */
export class NodeModuleLoader implements ModuleLoader {
  public async load<M>(id: string): Promise<M> {
    if (process.env.NEXT_RUNTIME !== 'edge') {
      try {
        // Need to `await` to cover the case that route is marked ESM modules by ESM escalation.
        return await require(id)
      } catch (err) {
        throw new Error(`Failed to load module "${id}"`, { cause: err })
      }
    }

    throw new Error('NodeModuleLoader is not supported in edge runtime.')
  }
}
