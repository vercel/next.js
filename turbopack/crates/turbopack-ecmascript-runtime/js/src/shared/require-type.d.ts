// Make sure that `require` is available for runtime-utils.ts.
declare var require: ((moduleId: ModuleId) => Exports) & {
  resolve: (
    moduleId: ModuleId,
    options?: {
      paths?: string[]
    }
  ) => ModuleId
}
