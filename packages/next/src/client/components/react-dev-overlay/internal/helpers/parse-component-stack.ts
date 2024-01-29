export type ComponentStackFrame = {
  canOpenInEditor: boolean
  component: string
  file?: string
  lineNumber?: number
  column?: number
}

enum LocationType {
  FILE = 'file',
  WEBPACK_INTERNAL = 'webpack-internal',
  HTTP = 'http',
  PROTOCOL_RELATIVE = 'protocol-relative',
  UNKNOWN = 'unknown',
}

/**
 * Get the type of frame line based on the location
 */
function getLocationType(location: string): LocationType {
  if (location.startsWith('file://')) {
    return LocationType.FILE
  }
  if (location.startsWith('webpack-internal://')) {
    return LocationType.WEBPACK_INTERNAL
  }
  if (location.startsWith('http://') || location.startsWith('https://')) {
    return LocationType.HTTP
  }
  if (location.startsWith('//')) {
    return LocationType.PROTOCOL_RELATIVE
  }
  return LocationType.UNKNOWN
}

function parseStackFrameLocation(
  location: string
): Omit<ComponentStackFrame, 'component'> {
  const locationType = getLocationType(location)

  const modulePath = location?.replace(
    /^(webpack-internal:\/\/\/|file:\/\/)(\(.*\)\/)?/,
    ''
  )
  const [, file, lineNumber, column] =
    modulePath?.match(/^(.+):(\d+):(\d+)/) ?? []

  switch (locationType) {
    case LocationType.FILE:
    case LocationType.WEBPACK_INTERNAL:
      return {
        canOpenInEditor: true,
        file,
        lineNumber: lineNumber ? Number(lineNumber) : undefined,
        column: column ? Number(column) : undefined,
      }
    // When the location is a URL we only show the file
    // TODO: Resolve http(s) URLs through sourcemaps
    case LocationType.HTTP:
    case LocationType.PROTOCOL_RELATIVE:
    case LocationType.UNKNOWN:
    default: {
      return {
        canOpenInEditor: false,
      }
    }
  }
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
      const location = match[3]

      if (!location) {
        componentStackFrames.push({
          canOpenInEditor: false,
          component,
        })
        continue
      }

      // Stop parsing the component stack if we reach a Next.js component
      if (location?.includes('next/dist')) {
        break
      }

      const frameLocation = parseStackFrameLocation(location)
      componentStackFrames.push({
        component,
        ...frameLocation,
      })
    }
  }

  return componentStackFrames
}
