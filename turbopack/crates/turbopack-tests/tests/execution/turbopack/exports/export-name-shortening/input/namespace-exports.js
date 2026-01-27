// Module to be imported with namespace import (import *)
// ALL export names must be preserved because Object.keys(ns) needs to work

export const x = 'ns-x'
export const y = 'ns-y'
export const z = 'ns-z'
export const veryLongNamespacedExport = 'ns-long-1'
export const anotherLongNamespacedExport = 'ns-long-2'

export function nsShortFn() {
  return 'ns-short-fn'
}

export function namespaceVeryLongFunctionName() {
  return 'ns-long-fn'
}
