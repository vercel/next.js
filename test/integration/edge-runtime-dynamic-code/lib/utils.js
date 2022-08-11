export const useCases = {
  eval: 'using-eval',
  noEval: 'not-using-eval',
  wasmCompile: 'using-webassembly-compile',
  wasmInstanciate: 'using-webassembly-instantiate',
  wasmBufferInstanciate: 'using-webassembly-instantiate-with-buffer',
}

export async function usingEval() {
  // eslint-disable-next-line no-eval
  return { value: eval('100') }
}

export async function notUsingEval() {
  return { value: 100 }
}

export function usingEvalSync() {
  // eslint-disable-next-line no-eval
  return { value: eval('100') }
}
