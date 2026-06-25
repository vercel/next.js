// Modern shape (mirrors @react-aria/i18n@3.12.x): an ESM entry that re-exports
// the named binding from a `./private/*` submodule. The bundler resolves the
// package here, via the `module` condition in the `exports` map, and sees the
// `useMessageFormatter` named export.
export { useMessageFormatter } from './private/useMessageFormatter.mjs'
