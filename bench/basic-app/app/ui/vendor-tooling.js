'use client'
// The heaviest kind of dependency real products ship to the client:
// an embedded language service (playgrounds, config editors, MDX
// previews). Referenced but never invoked during render.
import * as ts from 'typescript'

export function describeTooling(snippet) {
  if (!snippet) return 'idle'
  return ts.transpileModule(snippet, {
    compilerOptions: { module: ts.ModuleKind.ESNext },
  }).outputText.length
}
