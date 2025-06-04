/* eslint-disable @typescript-eslint/no-unused-vars */

/// <reference path="../shared/runtime-utils.ts" />

/// A 'base' utilities to support runtime can have externals.
/// Currently this is for node.js / edge runtime both.
/// If a fn requires node.js specific behavior, it should be placed in `node-external-utils` instead.

async function externalImport(id: ModuleId) {
  let raw
  try {
    raw = await import(id)
  } catch (err) {
    // TODO(alexkirsz) This can happen when a client-side module tries to load
    // an external module we don't provide a shim for (e.g. querystring, url).
    // For now, we fail semi-silently, but in the future this should be a
    // compilation error.
    throw new Error(`Failed to load external module ${id}: ${err}`)
  }

  if (raw && raw.__esModule && raw.default && 'default' in raw.default) {
    return interopEsm(raw.default, createNS(raw), true)
  }

  return raw
}

function externalRequire(
  id: ModuleId,
  thunk: () => any,
  esm: boolean = false
): Exports | EsmNamespaceObject {
  let raw
  try {
    raw = thunk()
  } catch (err) {
    // TODO(alexkirsz) This can happen when a client-side module tries to load
    // an external module we don't provide a shim for (e.g. querystring, url).
    // For now, we fail semi-silently, but in the future this should be a
    // compilation error.
    throw new Error(`Failed to load external module ${id}: ${err}`)
  }

  if (!esm || raw.__esModule) {
    return raw
  }

  return interopEsm(raw, createNS(raw), true)
}

externalRequire.resolve = (
  id: string,
  options?: {
    paths?: string[]
  }
) => {
  return require.resolve(id, options)
}
