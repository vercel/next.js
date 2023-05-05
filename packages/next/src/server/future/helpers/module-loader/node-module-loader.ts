import { ModuleLoader } from './module-loader'

/**
 * Loads a module using `require(id)`.
 */
export class NodeModuleLoader implements ModuleLoader {
  public async load<M>(id: string): Promise<M> {
    if (process.env.NEXT_RUNTIME !== 'edge') {
      return await require(id)
    }

    throw new Error('NodeModuleLoader is not supported in edge runtime.')
  }
}
