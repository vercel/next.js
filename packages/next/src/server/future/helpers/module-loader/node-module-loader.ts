import { ModuleLoader } from './module-loader'

/**
 * Loads a module using `require(id)`.
 */
export class NodeModuleLoader implements ModuleLoader {
  public load<M>(id: string): M {
    if (process.env.NEXT_RUNTIME !== 'edge') {
      return require(id)
    }

    throw new Error('NodeModuleLoader is not supported in edge runtime.')
  }
}
