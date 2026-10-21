import assert from 'node:assert/strict'
import { readFileSync, readdirSync, existsSync, statSync } from 'node:fs'
import { join, relative, isAbsolute } from 'node:path'
import { createHash } from 'node:crypto'
import vm from 'node:vm'
import { flight, bodyRow } from './body-row.mjs'

export function ownedTestManifests(fixture) {
  const roots = []
  for (const parent of [fixture, join(fixture, '.next')]) {
    if (!existsSync(parent)) continue
    for (const entry of readdirSync(parent, { withFileTypes: true }))
      if (
        entry.isDirectory() &&
        /^\.next-test-[a-zA-Z0-9.-]+$/.test(entry.name) &&
        !entry.name.startsWith('.next-test-pending-')
      ) {
        const root = join(parent, entry.name)
        if (existsSync(join(root, 'server/app'))) roots.push(root)
      }
  }
  assert.equal(
    roots.length,
    1,
    'A single public CLI entry must own one emitted artifact root'
  )
  const result = []
  function walk(path) {
    for (const entry of readdirSync(path, { withFileTypes: true })) {
      const file = join(path, entry.name)
      if (entry.isDirectory()) walk(file)
      else if (entry.name.endsWith('_client-reference-manifest.js')) {
        const raw = readFileSync(file, 'utf8'),
          context = {}
        vm.runInNewContext(raw, context)
        result.push({
          path: relative(roots[0], file),
          sha256: createHash('sha256').update(raw).digest('hex'),
          manifest: context.__RSC_MANIFEST,
        })
      }
    }
  }
  walk(join(roots[0], 'server/app'))
  assert(
    result.length > 0,
    'Actual compiler client-reference manifest required'
  )
  return result
}
function authoredPath(moduleId) {
  if (typeof moduleId !== 'string') return
  const match = moduleId.match(
    /\/app\/\[tenant\]\/render-error\/(?:nested\/)?error\.jsx(?=$| )/
  )
  return match?.[0]
}
export function decodeProof(body, format, manifests) {
  const models = new Map(),
    references = new Map(),
    errors = []
  for (const line of flight(body, format).split('\n')) {
    const match = line.match(/^([a-f0-9]+):(I|E)?(.*)$/)
    if (!match) continue
    let value
    try {
      value = JSON.parse(match[3])
    } catch {
      continue
    }
    if (match[2] === 'I') references.set(match[1], value)
    else if (match[2] === 'E') errors.push({ id: match[1], ...value })
    else models.set(match[1], value)
  }
  const moduleSources = new Map()
  for (const entry of manifests)
    for (const manifest of Object.values(entry.manifest ?? {}))
      for (const [key, value] of Object.entries(manifest.clientModules ?? {})) {
        const source = authoredPath(key)
        if (!source) continue
        const id = String(value.id)
        if (!moduleSources.has(id)) moduleSources.set(id, new Set())
        moduleSources.get(id).add(source)
      }
  function scalar(value, seen = new Set()) {
    const id = typeof value === 'string' && value.match(/^\$([a-f0-9]+)$/)?.[1]
    if (id && models.has(id)) {
      assert(!seen.has(id))
      seen.add(id)
      return scalar(models.get(id), seen)
    }
    return value
  }
  const visited = new Set(),
    boundaries = []
  function walk(value) {
    if (typeof value === 'string') {
      const id = value.match(/^\$(?:L|@|Q|W)?([a-f0-9]+)$/)?.[1]
      if (id && !visited.has(id)) {
        visited.add(id)
        if (models.has(id)) walk(models.get(id))
      }
      return
    }
    if (Array.isArray(value)) {
      // Only the actual element props are renderer input. Development owner
      // slots remain raw evidence and cannot add unreachable router bindings.
      if (value[0] === '$') {
        walk(value[3])
        return
      }
      for (const item of value) walk(item)
    } else if (value && typeof value === 'object') {
      if (
        'parallelRouterKey' in value &&
        typeof value.error === 'string' &&
        value.error !== '$undefined'
      ) {
        const id = value.error.match(/^\$(?:L)?([a-f0-9]+)$/)?.[1]
        assert(
          id && references.has(id),
          'Actual LayoutRouter.error must resolve an emitted I record'
        )
        const record = references.get(id),
          moduleId = scalar(record[0])
        let source = authoredPath(moduleId)
        if (!source) {
          const candidates = moduleSources.get(String(moduleId))
          assert(
            candidates?.size === 1,
            'Numeric boundary module ID requires one actual compiler manifest source'
          )
          source = [...candidates][0]
        }
        boundaries.push({ source, exportName: scalar(record[2]) })
      }
      for (const [key, item] of Object.entries(value))
        if (key !== '_owner' && key !== '_debugInfo') walk(item)
    }
  }
  assert(models.has('0'), 'Actual Flight root record required')
  visited.add('0')
  walk(models.get('0'))
  return { models, errors, boundaries, visited }
}
export function semanticResponse(
  response,
  format,
  manifests,
  sourceError,
  fixture,
  stringHash
) {
  const raw = bodyRow(response, format)
  const { models, errors, boundaries, visited } = decodeProof(
    response.body,
    format,
    manifests
  )
  const { errorRecords, clientReferences, ...fields } = raw
  const pattern =
    format === 'html'
      ? /<div id="render-error-values">([^<]+)<\/div>/
      : /"id":"render-error-values","children":("(?:[^"\\]|\\.)*")/
  const match = response.body.match(pattern)
  const subject = match
    ? format === 'html'
      ? JSON.parse(match[1].replaceAll('&quot;', '"'))
      : JSON.parse(JSON.parse(match[1]))
    : null
  const errorFacts = errors.map((error) => {
    assert(
      sourceError,
      'Serialized error requires its actual original Error observation'
    )
    assert.equal(error.digest, sourceError.digest)
    assert.equal(
      error.digest,
      stringHash(sourceError.message + (sourceError.stack || '')).toString()
    )
    assert(
      visited.has(error.id),
      'Selected response model must reference its error record'
    )
    const { id, digest, stack, owner, ...visible } = error
    const fact = {
      serializedFields: Object.keys(error)
        .filter((key) => key !== 'id')
        .sort(),
      ...visible,
      digestLinksOriginalError: true,
      digestMatchesActualHash: true,
      selectedModelReferencesError: true,
    }
    if (stack) {
      fact.stack = stack.map(([name, file, line, column, ...flags]) => {
        const path = relative(fixture, file)
        assert(
          !path.startsWith('..') &&
            !isAbsolute(path) &&
            statSync(file).isFile(),
          'Serialized stack must retain its actual owned emitted source'
        )
        return { name, line, column, flags, ownedEmittedSource: true }
      })
    }
    if (owner) {
      const reference = owner.match(/^\$([a-f0-9]+)$/)?.[1]
      assert(reference)
      const actual = models.get(reference)
      fact.owner = { present: true, recordInResponse: actual !== undefined }
      if (actual !== undefined) {
        assert(actual && typeof actual === 'object')
        fact.owner.name = actual.name
        fact.owner.env = actual.env
      }
    }
    return fact
  })
  return { ...fields, subject, boundaries, errorFacts }
}
