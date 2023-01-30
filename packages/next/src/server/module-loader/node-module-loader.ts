import { ModuleLoader } from './module-loader'

export class NodeModuleLoader implements ModuleLoader {
  public load<M>(id: string): M {
    return require(id)
  }
}
