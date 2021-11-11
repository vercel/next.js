export function getTextWithEval() {
  // eslint-disable-next-line no-eval
  return eval('with some text')
}

export function getText() {
  return 'with some text'
}
