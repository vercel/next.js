import fs from 'fs/promises'
import path from 'path'
import { type NullableMappedPosition, SourceMapConsumer } from 'source-map'

export async function findOriginalSourcePositionAndContent(
  map: any,
  position: { line: number; column: number | null }
) {
  const consumer = await new SourceMapConsumer(map)
  try {
    const sourcePosition: NullableMappedPosition = consumer.originalPositionFor(
      {
        line: position.line,
        column: position.column ?? 0,
      }
    )

    if (!sourcePosition.source) {
      return null
    }

    const sourceContent: string | null =
      consumer.sourceContentFor(
        sourcePosition.source,
        /* returnNullOnMissing */ true
      ) ?? null

    return {
      sourcePosition,
      sourceContent,
    }
  } finally {
    consumer.destroy()
  }
}

export async function extractSourceMapFilepath(
  sourceFilePath: string
): Promise<string | undefined> {
  try {
    const sourceFileContents = await fs.readFile(sourceFilePath, 'utf8')
    const relative = sourceFileContents.match(
      /\/\/#\s*sourceMappingURL\s*=(.*)/
    )?.[1]

    if (relative !== undefined) {
      return path.resolve(path.dirname(sourceFilePath), relative)
    }
  } catch {}
}
