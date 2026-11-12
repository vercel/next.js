export interface SourceLocation {
  line: number
  column: number
}

export function getLocator(source: string): (index: number) => SourceLocation {
  const lineOffsets = [0]

  for (
    let i = source.indexOf('\n');
    i !== -1;
    i = source.indexOf('\n', i + 1)
  ) {
    lineOffsets.push(i + 1)
  }

  return function locate(index: number): SourceLocation {
    let i = 0
    let j = lineOffsets.length
    while (i < j) {
      const m = (i + j) >> 1
      if (index < lineOffsets[m]) {
        j = m
      } else {
        i = m + 1
      }
    }
    const line = i - 1
    const column = index - lineOffsets[line]
    return { line, column }
  }
}
