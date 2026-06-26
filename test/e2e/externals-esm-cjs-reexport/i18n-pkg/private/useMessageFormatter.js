
// CommonJS submodule. The named export exists at runtime, but it is defined via
// a Parcel-style `$parcel$export` helper (exactly what @react-aria/i18n's flat
// build does) rather than `exports.useMessageFormatter = ...`. Node's
// `cjs-module-lexer` cannot statically detect it, so an ESM `export { ... } from`
// this file fails with "does not provide an export named 'useMessageFormatter'".
function $parcel$export(target, name, get) {
  Object.defineProperty(target, name, {
    get,
    enumerable: true,
    configurable: true,
  })
}

function useMessageFormatter() {
  return 'message-from-i18n-pkg'
}

$parcel$export(module.exports, 'useMessageFormatter', () => useMessageFormatter)
