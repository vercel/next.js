// `export *` from a module with dynamic exports: the re-exported names are only known at runtime,
// so this module keeps its original export names.
export * from './dynamic-cjs'

export const ownLongExportName = 'own-value'
