/**
 * Loads a given module for a given ID.
 */
export interface ModuleLoader {
  load<M = any>(id: string): M
}
