import { createHash } from 'node:crypto'
import { lstat, readFile, realpath } from 'node:fs/promises'
import { isAbsolute, join, relative, sep } from 'node:path'
import {
  SourceMapConsumer,
  type RawSourceMap,
} from 'next/dist/compiled/source-map'
import type { CompiledBrowserClientTestArtifact } from '../contracts'
import { assertClientPath } from '../compiler/client'

/** Select only sources actually mapped by the same flat section as their content. */
function selectMappedSources(rawMap: RawSourceMap, sourceHash: string) {
  const selected = new Set<string>()
  const contents = new Map<string, Set<string | null>>()
  function visit(map: RawSourceMap, flatConsumer?: SourceMapConsumer) {
    const sections = (
      map as RawSourceMap & { sections?: { map: RawSourceMap }[] }
    ).sections
    if (sections) {
      for (const section of sections) visit(section.map)
      return
    }
    // Indexed enumeration can misread absent source indexes. Flat consumers may
    // normalize an absent source to '.' or sourceRoot; null original coordinates
    // are authoritative for whether the segment maps a source.
    const consumer = flatConsumer ?? new SourceMapConsumer(map)
    const sources = new Set<string>()
    consumer.eachMapping((mapping) => {
      if (
        mapping.source &&
        mapping.originalLine !== null &&
        mapping.originalColumn !== null
      )
        sources.add(mapping.source)
    })
    for (const source of sources) {
      const content = consumer.sourceContentFor(source, true)
      const hash =
        content === null
          ? null
          : createHash('sha256').update(content).digest('hex')
      let versions = contents.get(source)
      if (!versions) contents.set(source, (versions = new Set()))
      versions.add(hash)
      if (hash === sourceHash) selected.add(source)
    }
  }
  // Construction validates every nested version, section offset and map/url.
  visit(rawMap, new SourceMapConsumer(rawMap))
  for (const source of selected)
    if (contents.get(source)!.size > 1)
      throw new Error(
        'Ambiguous original source identities in Browser Mode maps.'
      )
  return [...selected]
}

/** Every read revalidates the immutable complete native output closure. */
export async function createClientAssetReader(
  artifact: CompiledBrowserClientTestArtifact
) {
  const root = await realpath(artifact.rootDir),
    files = new Set(artifact.files),
    hashes = new Map<string, string>()
  if (
    artifact.client.version !== 1 ||
    artifact.client.outputs.length !== files.size ||
    files.size !== artifact.files.length
  )
    throw new Error('Invalid Browser Mode output closure.')
  for (const output of artifact.client.outputs) {
    assertClientPath(output.path)
    if (
      !files.has(output.path) ||
      hashes.has(output.path) ||
      !/^[a-f0-9]{64}$/.test(output.sha256)
    )
      throw new Error('Invalid Browser Mode output identity.')
    hashes.set(output.path, output.sha256)
  }
  for (const file of [...artifact.client.scripts, ...artifact.client.styles])
    if (!files.has(file))
      throw new Error('Browser bootstrap escaped its output closure.')
  async function read(file: string) {
    assertClientPath(file)
    if (!files.has(file))
      throw new Error('Browser asset is outside the compiler-issued allowlist.')
    const path = join(root, file),
      canonical = await realpath(path),
      child = relative(root, canonical)
    if (
      !child ||
      child === '..' ||
      child.startsWith(`..${sep}`) ||
      isAbsolute(child) ||
      !(await lstat(path)).isFile()
    )
      throw new Error('Browser output escaped its immutable regular-file root.')
    const bytes = await readFile(path)
    if (
      createHash('sha256').update(bytes).digest('hex') !== hashes.get(file) ||
      (await realpath(path)) !== canonical
    )
      throw new Error('Browser output changed after native compilation.')
    return bytes
  }
  async function verify() {
    for (const file of files) await read(file)
  }
  await verify()
  return {
    read,
    verify,
    async sourceMaps(origin: string) {
      const maps: { url: string; map: unknown; originalSources: string[] }[] =
        []
      const originals = new Set<string>()
      const countedMaps = new Set<string>()
      let total = 0
      const assetURL = (file: string) =>
        new URL(
          `/_next/${file.split('/').map(encodeURIComponent).join('/')}`,
          origin
        )
      for (const script of files) {
        if (!script.endsWith('.js')) continue
        const url = assetURL(script)
        const scriptText = (await read(script)).toString('utf8')
        const footer = scriptText.match(
          /(?:^|\n)(?:[\t ]*\/\/[^\r\n]*(?:\r?\n|$))+\s*$/
        )?.[0]
        const reference = footer
          ? [
              ...footer.matchAll(
                /^[\t ]*\/\/[#@]\s*sourceMappingURL=(\S+)[\t ]*\r?$/gm
              ),
            ].at(-1)?.[1]
          : undefined
        let file = `${script}.map`
        if (reference) {
          const target = new URL(reference, url)
          if (
            target.origin !== url.origin ||
            !target.pathname.startsWith('/_next/') ||
            target.search ||
            target.hash
          )
            continue
          file = decodeURIComponent(target.pathname.slice('/_next/'.length))
        }
        if (!file.endsWith('.js.map') || !files.has(file)) continue
        const raw = await read(file)
        if (!countedMaps.has(file)) {
          countedMaps.add(file)
          total += raw.length
        }
        if (total > 64 * 1024 * 1024)
          throw new Error(
            'Browser source-map closure exceeded the bounded client profile.'
          )
        const map = JSON.parse(raw.toString('utf8'))
        const selected = selectMappedSources(map, artifact.sourceHash)
        for (const source of selected) originals.add(source)
        if (selected.length)
          maps.push({
            url: url.href,
            map,
            originalSources: selected,
          })
      }
      if (originals.size > 1)
        throw new Error(
          'Ambiguous original source identities in Browser Mode maps.'
        )
      return maps
    },
  }
}
