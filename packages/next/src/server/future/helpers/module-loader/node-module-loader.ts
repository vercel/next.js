import { ModuleLoader } from './module-loader'

/**
 * Loads a module using `require(id)`.
 */
export class NodeModuleLoader implements ModuleLoader {
  public load<M>(id: string): M {
    return require(id)
  }
}
