export interface ModuleLoader {
  load<M = any>(id: string): M
}
