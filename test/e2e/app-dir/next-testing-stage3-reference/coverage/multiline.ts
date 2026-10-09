export function multiline(value: number) {
  const computed =
    value +
    2 *
      value
  return `result:
${computed}
${value > 0 ? 'positive' : 'nonpositive'}
end`
}

export function unusedMultiline(value: number) {
  return (
    value +
    100
  )
}
