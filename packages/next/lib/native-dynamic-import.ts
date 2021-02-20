// The 'babel-plugin-dynamic-import-node' babel plugin will be disabled for
// this file so that we can use it as an escape hatch to the native import()
// implementation
export default async function nativeImport(mod: string) {
  return import(mod)
}
