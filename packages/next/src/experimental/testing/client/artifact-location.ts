import { parse, type Token } from 'next/dist/compiled/acorn'
import { mapArtifactCallLocation } from '../reporting/artifact-call-location'
import type { TestArtifactLocation } from '../runner/tasks'
import type { createClientSourceMapResolver } from './source-maps'

/** Use the exact selected frame's retained source, without reading a live file. */
export function getClientArtifactLocation(
  error: Error,
  mapper: Pick<
    ReturnType<typeof createClientSourceMapResolver>,
    'mapLocation' | 'getSourceContent'
  >
): TestArtifactLocation | undefined {
  for (const line of error.stack?.split('\n') ?? []) {
    const match = /(https?:\/\/[^\s)]+):(\d+):(\d+)\)?$/.exec(line)
    if (!match) continue
    const frame = {
      file: match[1],
      line: Number(match[2]),
      column: Number(match[3]),
    }
    try {
      const mapped = mapper.mapLocation(frame)
      const location = {
        file: mapped.file,
        line: mapped.line,
        column: mapped.column,
      }
      try {
        const source = mapper.getSourceContent(frame)
        if (source !== null)
          return mapArtifactCallLocation(
            source,
            location.file,
            location,
            (content) => {
              const tokens: Token[] = []
              const syntax = parse(content, {
                ecmaVersion: 'latest',
                sourceType: 'module',
                allowReturnOutsideFunction: true,
                locations: true,
                preserveParens: true,
                onToken: tokens,
              })
              return { ...syntax, tokens }
            }
          )
      } catch {
        // An otherwise selected location survives unavailable retained source.
      }
      return location
    } catch {
      // Framework frames are not selected test source locations.
    }
  }
}
