import { interopDefault } from '../../../../lib/interop-default'
import { ModuleLoader } from './module-loader'

/**
 * Loads a module using `require(id)`.
 */
export class NodeModuleLoader implements ModuleLoader {
  public async load<M>(id: string): Promise<M> {
    if (process.env.NEXT_RUNTIME !== 'edge') {
      // Use dynamic import to cover the case that route is marked ESM modules by ESM escalation.
      const mod = await import(/* webpackMode: "eager" */ id).then((m) =>
        interopDefault(m)
      )
      return mod
    }

    throw new Error('NodeModuleLoader is not supported in edge runtime.')
  }
}
