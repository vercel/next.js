export type ComponentStackFrame = {
  component: string
  file?: string
  lineNumber?: number
  column?: number
}

export function parseComponentStack(
  componentStack: string
): ComponentStackFrame[] {
  const componentStackFrames: ComponentStackFrame[] = []

  for (const line of componentStack.trim().split('\n')) {
    // Get component and file from the component stack line
    const match = /at ([^ ]+)( \((.*)\))?/.exec(line)
    if (match?.[1]) {
      const component = match[1]
      const webpackFile = match[3]

      // Stop parsing the component stack if we reach a Next.js component
      if (webpackFile?.includes('next/dist/client/components/')) {
        break
      }

      const modulePath = webpackFile?.replace(
        /^(webpack-internal:\/\/\/|file:\/\/)(\(.*\)\/)?/,
        ''
      )
      const [file, lineNumber, column] = modulePath?.split(':') ?? []

      componentStackFrames.push({
        component,
        file,
        lineNumber: lineNumber ? Number(lineNumber) : undefined,
        column: column ? Number(column) : undefined,
      })
    }
  }

  return componentStackFrames
}
