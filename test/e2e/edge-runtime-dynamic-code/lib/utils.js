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
