import { parse } from 'next/dist/compiled/babel/parser'
import { fileURLToPath } from 'node:url'
import { resolve } from 'node:path'
import {
  getTestStackFrames,
  getTestFrameSource,
  isTestFrameOriginal,
} from './test-stack-frames'
import type { TestArtifactLocation } from '../runner/tasks'
import { mapArtifactCallLocation as mapWithSyntax } from './artifact-call-location'

export function mapArtifactCallLocation(
  source: string,
  filename: string,
  location: TestArtifactLocation
): TestArtifactLocation {
  return mapWithSyntax(source, filename, location, (content, file) =>
    parse(content, {
      sourceType: 'unambiguous',
      sourceFilename: file,
      allowReturnOutsideFunction: true,
      createParenthesizedExpressions: true,
      tokens: true,
      plugins: [
        ...(/\.[cm]?ts$/.test(file) ? [] : ['jsx' as const]),
        'decorators-legacy',
        ...(/\.[cm]?tsx?$/.test(file) ? ['typescript' as const] : []),
      ],
    })
  )
}

/** Uses only the execution artifact's retained original source, never a live file. */
export function mapTestArtifactLocation(
  error: Error,
  testPath: string
): TestArtifactLocation | undefined {
  if (!error.stack) return
  const selected = getTestStackFrames(error.stack, {
    includeSourceContent: true,
  }).find((candidate) => {
    const frame = candidate.frame
    if (
      !isTestFrameOriginal(candidate) ||
      !frame.file ||
      !frame.line1 ||
      !frame.column1
    )
      return false
    const file = frame.file.startsWith('file:')
      ? fileURLToPath(frame.file)
      : resolve(frame.file)
    return file === resolve(testPath)
  })
  const frame = selected?.frame
  if (!selected || !frame?.file || !frame.line1 || !frame.column1) return
  const location = {
    file: frame.file.startsWith('file:')
      ? fileURLToPath(frame.file)
      : resolve(frame.file),
    line: frame.line1,
    column: frame.column1,
  }
  try {
    const source = getTestFrameSource(selected)
    return typeof source === 'string'
      ? mapArtifactCallLocation(source, location.file, location)
      : location
  } catch {
    return location
  }
}
