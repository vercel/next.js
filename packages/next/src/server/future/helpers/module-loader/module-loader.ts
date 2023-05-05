/**
 * Loads a given module for a given ID.
 */
export interface ModuleLoader {
  load<M = unknown>(id: string): Promise<M>
}
