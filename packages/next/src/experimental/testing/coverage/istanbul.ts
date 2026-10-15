import { parse, type Comment } from 'next/dist/compiled/acorn'
import {
  SourceMapGenerator,
  type Mapping,
  type RawSourceMap,
} from 'next/dist/compiled/source-map'
import { convert } from '../../../compiled/next-test-coverage'
import { join } from 'path'
import { pathToFileURL } from 'url'
import type { CompiledTestArtifact } from '../contracts'
import { coverageHash, readArtifactFile } from './artifact'
import { decodeCoverageMap } from './maps'
import { remapCoverage } from './remap'
import type {
  CoverageCapture,
  StandardFileCoverage,
  StandardCoverageData,
} from './types'

/** Convert only retained compiler bytes, V8 counts and allowlisted source maps. */
export async function remapStandardCoverage(
  artifact: CompiledTestArtifact,
  capture: CoverageCapture,
  selectSource?: (file: string) => boolean
): Promise<StandardFileCoverage> {
  // The legacy validator also checks every generated/original coordinate, nested
  // V8 range, original source identity/hash and entry capture before conversion.
  await remapCoverage(artifact, capture)
  const files: StandardFileCoverage['files'] = []
  const sources = artifact.coverage!.sources
  for (const script of capture.scripts) {
    const metadata = artifact.coverage!.scripts.find(
      (item) => item.path === script.path
    )!
    const [bytes, mapBytes] = await Promise.all([
      readArtifactFile(artifact.rootDir, script.path),
      readArtifactFile(artifact.rootDir, metadata.mapPath!),
    ])
    // Do not assume the lease protects against changed bytes between reads.
    if (
      coverageHash(bytes) !== script.sha256 ||
      coverageHash(mapBytes) !== metadata.mapSha256
    )
      throw new Error(
        `Coverage artifact changed before standard conversion: ${script.path}`
      )
    const code = bytes.toString('utf8')
    const decoded = decodeCoverageMap(JSON.parse(mapBytes.toString('utf8')))
    const map = new SourceMapGenerator()
    const sourceContent = new Map<string, string>()
    for (const mapping of decoded.mappings) {
      const candidate = mapping.source === null ? null : sources[mapping.source]
      const source =
        candidate && (!selectSource || selectSource(candidate.file))
          ? candidate
          : null
      const generated = {
        line: mapping.generatedLine,
        column: mapping.generatedColumn,
      }
      if (source) {
        map.addMapping({
          generated,
          source: source.file,
          original: {
            line: mapping.originalLine!,
            column: mapping.originalColumn!,
          },
        })
      } else {
        // source-map supports an unmapped segment; its 0.6 declarations omit
        // that overload. Keep the boundary instead of mapping excluded code.
        ;(map.addMapping as (mapping: Pick<Mapping, 'generated'>) => void)({
          generated,
        })
      }
    }
    for (const [identity, content] of decoded.sources) {
      const source = sources[identity]
      if (source && (!selectSource || selectSource(source.file))) {
        if (
          typeof content !== 'string' ||
          coverageHash(content) !== source.sha256
        )
          throw new Error(
            `Coverage original source changed before standard conversion: ${identity}`
          )
        map.setSourceContent(source.file, content)
        sourceContent.set(source.file, content)
      }
    }
    const sourceMap = JSON.parse(map.toString()) as RawSourceMap
    if (!sourceMap.sources.length) continue
    const comments: Comment[] = []
    const ast = Object.assign(
      parse(code, {
        ecmaVersion: 'latest',
        sourceType: 'module',
        locations: true,
        onComment: comments,
      }),
      { comments }
    )
    const mapped = await convert({
      code,
      sourceMap,
      ast,
      coverage: {
        url: pathToFileURL(join(artifact.rootDir, script.path)).href,
        functions: script.functions,
      },
    })
    for (const [file, data] of Object.entries(mapped)) {
      if (file !== data.path || !sourceContent.has(file))
        throw new Error(
          `Standard coverage returned an undeclared original source: ${file}`
        )
      const content = sourceContent.get(file)!
      files.push({
        file,
        sha256: coverageHash(content),
        data: await recoverJavaScriptFunctions(
          file,
          content,
          data as StandardCoverageData
        ),
      })
    }
  }
  return {
    version: 1,
    entryId: artifact.entryId,
    revision: artifact.revision,
    complete: true,
    errors: [],
    files,
  }
}

function identityMap(file: string, source: string) {
  const map = new SourceMapGenerator()
  for (const [index, line] of source.split('\n').entries()) {
    let column = 0
    // The mapper uses these same lexical boundaries for its identity source map.
    for (const token of line.matchAll(/\w+|\s|[^\w\s]/g)) {
      const position = { line: index + 1, column }
      map.addMapping({ generated: position, source: file, original: position })
      column += token[0].length
    }
  }
  map.setSourceContent(file, source)
  return JSON.parse(map.toString()) as RawSourceMap
}

/** Declaration-only coverage. This never imports or executes the source file. */
export async function createUncoveredJavaScript(
  file: string,
  source: string
): Promise<StandardCoverageData> {
  if (!/\.[cm]?js$/.test(file))
    throw new Error(
      `Standard coverage currently requires a JavaScript source file: ${file}`
    )
  const comments: Comment[] = []
  let ast: ReturnType<typeof parse> & { comments: Comment[] }
  try {
    ast = Object.assign(
      parse(source, {
        ecmaVersion: 'latest',
        sourceType: 'module',
        locations: true,
        onComment: comments,
      }),
      { comments }
    )
  } catch (cause) {
    throw new Error(
      `Standard coverage currently requires syntax-preserved JavaScript: ${file}`,
      { cause }
    )
  }
  const data = await convert({
    code: source,
    ast,
    sourceMap: identityMap(file, source),
    coverage: {
      url: pathToFileURL(file).href,
      // This is deliberately uncovered-source metadata, not a runtime V8 capture.
      functions: source.length
        ? [
            {
              isBlockCoverage: true,
              ranges: [{ startOffset: 0, endOffset: source.length, count: 0 }],
            },
          ]
        : [],
    },
  })
  const result = data[file]
  if (!result || result.path !== file || Object.keys(data).length !== 1)
    throw new Error(
      `Uncovered coverage returned an unexpected source identity: ${file}`
    )
  return result as StandardCoverageData
}

/** Restore JS function locations only after a complete one-to-one association. */
async function recoverJavaScriptFunctions(
  file: string,
  source: string,
  data: StandardCoverageData
): Promise<StandardCoverageData> {
  const original = await createUncoveredJavaScript(file, source)
  if (Object.keys(original.fnMap).length !== Object.keys(data.fnMap).length)
    throw new Error(
      `Standard coverage generated and original function counts differ: ${file}`
    )
  const used = new Set<string>()
  const fnMap: StandardCoverageData['fnMap'] = {}
  const f: StandardCoverageData['f'] = {}
  for (const [id, fn] of Object.entries(original.fnMap)) {
    const candidates = Object.entries(data.fnMap).filter(
      ([, mapped]) =>
        mapped.decl.start.line === fn.decl.start.line &&
        mapped.decl.start.column === fn.decl.start.column
    )
    if (candidates.length !== 1 || used.has(candidates[0][0]))
      throw new Error(
        `Standard coverage function association is ambiguous or absent: ${file}`
      )
    const [mappedId, mapped] = candidates[0]
    if (
      mapped.loc.end.line !== fn.loc.end.line ||
      (mapped.name !== fn.name &&
        !(
          mapped.name.startsWith(fn.name + '_') &&
          /^\d+$/.test(mapped.name.slice(fn.name.length + 1))
        ))
    )
      throw new Error(
        `Standard coverage function transformation is unsupported: ${file}`
      )
    used.add(mappedId)
    fnMap[id] = fn
    f[id] = data.f[mappedId]
  }
  const meta = data.meta
  if (meta && original.meta) {
    const seen = Object.fromEntries(
      Object.entries(meta.seen).filter(([key]) => !key.startsWith('f:'))
    )
    Object.assign(
      seen,
      Object.fromEntries(
        Object.entries(original.meta.seen).filter(([key]) =>
          key.startsWith('f:')
        )
      )
    )
    return {
      ...data,
      fnMap,
      f,
      meta: {
        ...meta,
        lastFunction: original.meta.lastFunction,
        fnNames: original.meta.fnNames,
        seen,
      },
    }
  }
  return { ...data, fnMap, f }
}
