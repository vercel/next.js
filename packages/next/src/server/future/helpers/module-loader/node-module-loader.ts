import { ModuleLoader } from './module-loader'

/**
 * Loads a module using `await require(id)`.
 */
export class NodeModuleLoader implements ModuleLoader {
  public async load<M>(id: string): Promise<M> {
    if (process.env.NEXT_RUNTIME !== 'edge') {
      // Need to `await` to cover the case that route is marked ESM modules by ESM escalation.
      return await require(id)
    }

    throw new Error('NodeModuleLoader is not supported in edge runtime.')
  }
}
