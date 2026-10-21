import { readFile, stat, writeFile } from 'node:fs/promises'
import { dirname, isAbsolute, join, relative } from 'node:path'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'
import ts from 'typescript'
import prettier from 'prettier'

const require = createRequire(import.meta.url)
const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const manifest = require('vitest/package.json')
if (manifest.version !== '5.0.4')
  throw new Error('Inventory requires exactly Vitest 5.0.4.')
const referenceRoot = dirname(require.resolve('vitest/package.json'))
const options = {
  target: ts.ScriptTarget.ESNext,
  module: ts.ModuleKind.NodeNext,
  moduleResolution: ts.ModuleResolutionKind.NodeNext,
  skipLibCheck: true,
}
function declaration(value) {
  if (!value) return undefined
  if (typeof value === 'string')
    return value.endsWith('.d.ts') ? value : undefined
  if (value?.types) return value.types
  return declaration(value?.import)
}
const paths = Object.entries(manifest.exports).flatMap(([subpath, value]) => {
  const file = declaration(value)
  return file ? [{ subpath, file: join(referenceRoot, file) }] : []
})
const program = ts.createProgram(
  paths.map(({ file }) => file),
  options
)
const checker = program.getTypeChecker()
const rows = []
const keys = new Set()
function add(row) {
  if (keys.has(row.api)) return
  keys.add(row.api)
  rows.push({ ...row, classification: 'Missing or unverified' })
}
function signatures(type) {
  return type
    .getCallSignatures()
    .map((signature) => checker.signatureToString(signature))
}
for (const { subpath, file } of paths) {
  const source = program.getSourceFile(file)
  const symbol = source && checker.getSymbolAtLocation(source)
  if (!source) throw new Error(`Cannot inventory Vitest ${subpath}`)
  if (!symbol) {
    add({
      api: `vitest${subpath.slice(1)}`,
      surface: 'ambient declarations',
    })
    continue
  }
  for (const exported of checker.getExportsOfModule(symbol)) {
    const resolved =
      exported.flags & ts.SymbolFlags.Alias
        ? checker.getAliasedSymbol(exported)
        : exported
    const runtime = Boolean(resolved.flags & ts.SymbolFlags.Value)
    const api = `vitest${subpath === '.' ? '' : subpath.slice(1)}:${exported.name}`
    const type = checker.getTypeOfSymbolAtLocation(resolved, source)
    add({
      api,
      surface: runtime ? 'runtime export' : 'public type',
      overloads: signatures(type),
    })
    if (
      subpath === '.' &&
      ['test', 'it', 'describe', 'suite', 'vi', 'vitest', 'expect'].includes(
        exported.name
      )
    ) {
      for (const property of type.getProperties()) {
        const member = checker.getTypeOfSymbolAtLocation(property, source)
        add({
          api: `${api}.${property.name}`,
          surface: 'authoring member',
          overloads: signatures(member),
        })
      }
    }
    if (subpath === './config' && exported.name === 'ViteUserConfig') {
      const config = checker.getDeclaredTypeOfSymbol(resolved)
      for (const property of config.getProperties()) {
        add({ api: `config.${property.name}`, surface: 'configuration' })
      }
      const test = config.getProperty('test')
      if (!test) throw new Error('Reference config has no test options.')
      const testOptions = checker.getNonNullableType(
        checker.getTypeOfSymbolAtLocation(test, source)
      )
      for (const property of testOptions.getProperties()) {
        add({
          api: `config.test.${property.name}`,
          surface: 'test configuration',
        })
        if (
          [
            'coverage',
            'browser',
            'typecheck',
            'sequence',
            'chaiConfig',
            'deps',
          ].includes(property.name)
        ) {
          const nested = checker.getNonNullableType(
            checker.getTypeOfSymbolAtLocation(property, source)
          )
          for (const member of nested.getProperties())
            add({
              api: `config.test.${property.name}.${member.name}`,
              surface: 'test configuration',
            })
        }
      }
    }
  }
}
rows.sort((a, b) => (a.api < b.api ? -1 : a.api > b.api ? 1 : 0))

// Availability is extracted from the actual Next facades, independently of the
// reference program. Merely exporting a name does not establish conformance.
const entries = {
  vitest: 'packages/next/src/experimental/testing/vitest.ts',
  'vitest/config': 'packages/next/src/experimental/testing/config-api.ts',
  'vitest/browser':
    'packages/next/src/experimental/testing/client/browser-context.ts',
}
const nextProgram = ts.createProgram(
  Object.values(entries).map((file) => join(root, file)),
  options
)
const nextChecker = nextProgram.getTypeChecker()
const facades = new Map(
  Object.entries(entries).map(([name, file]) => {
    const source = nextProgram.getSourceFile(join(root, file))
    const symbol = source && nextChecker.getSymbolAtLocation(source)
    if (!symbol) throw new Error(`Cannot inventory Next facade ${name}`)
    return [
      name,
      {
        file,
        source,
        exports: new Map(
          nextChecker
            .getExportsOfModule(symbol)
            .map((item) => [item.name, item])
        ),
      },
    ]
  })
)
function availability(row) {
  const match = /^(vitest(?:\/[^:]+)?):([^.]+)(?:\.(.+))?$/.exec(row.api)
  if (!match) return { status: 'not-applicable' }
  const [, module, name, member] = match
  const facade = facades.get(module)
  const exported = facade?.exports.get(name)
  if (!exported)
    return { status: 'absent', ...(facade && { entry: facade.file }) }
  const resolved =
    exported.flags & ts.SymbolFlags.Alias
      ? nextChecker.getAliasedSymbol(exported)
      : exported
  const typeOnly = exported.declarations?.some(
    (item) =>
      ts.isExportSpecifier(item) &&
      (item.isTypeOnly || item.parent.parent.isTypeOnly)
  )
  const exists = member
    ? nextChecker
        .getTypeOfSymbolAtLocation(resolved, facade.source)
        .getProperty(member)
    : row.surface === 'runtime export'
      ? !typeOnly && resolved.flags & ts.SymbolFlags.Value
      : resolved.flags & ts.SymbolFlags.Type
  return { status: exists ? 'available' : 'absent', entry: facade.file }
}

const evidencePath = join(
  root,
  'packages/next/src/experimental/testing/compatibility-evidence.json'
)
const evidence = JSON.parse(await readFile(evidencePath, 'utf8'))
if (evidence.version !== 1 || evidence.referenceVersion !== manifest.version)
  throw new Error('Compatibility evidence schema or reference version drifted.')
const capabilitySource = ts.createSourceFile(
  'capabilities.ts',
  await readFile(
    join(root, 'packages/next/src/experimental/testing/capabilities.ts'),
    'utf8'
  ),
  ts.ScriptTarget.Latest,
  true
)
let capabilityObject
for (const statement of capabilitySource.statements) {
  if (!ts.isVariableStatement(statement)) continue
  for (const declaration of statement.declarationList.declarations) {
    if (declaration.name.getText(capabilitySource) === 'testCapabilities') {
      capabilityObject = declaration.initializer
      while (ts.isAsExpression(capabilityObject))
        capabilityObject = capabilityObject.expression
    }
  }
}
function hasCapability(path) {
  let current = capabilityObject
  for (const key of path.split('.')) {
    if (!current || !ts.isObjectLiteralExpression(current)) return false
    current = current.properties.find(
      (property) => property.name?.getText(capabilitySource) === key
    )?.initializer
  }
  return Boolean(current)
}
const statuses = new Set(['scoped', 'partial', 'missing', 'unreviewed'])
const nonemptyString = (value) =>
  typeof value === 'string' && value.trim() !== ''
if (
  !Array.isArray(evidence.groups) ||
  !evidence.groups.length ||
  [...statuses].some(
    (status) => !nonemptyString(evidence.implementationStatus?.[status])
  ) ||
  !nonemptyString(evidence.checkpoint?.implementationCommit) ||
  !evidence.checkpoint.lastFullAcceptance ||
  evidence.qualification?.stableReady !== false ||
  evidence.qualification.supportedVersionRange !== null ||
  !Array.isArray(evidence.qualification.approvedExceptions)
)
  throw new Error('Incomplete compatibility evidence metadata.')
const groupIds = new Set()
const rowGroups = new Map()
for (const group of evidence.groups) {
  if (groupIds.has(group.id) || !nonemptyString(group.id))
    throw new Error(`Duplicate or empty compatibility evidence id: ${group.id}`)
  groupIds.add(group.id)
  if (!statuses.has(group.status))
    throw new Error(`Invalid compatibility implementation status: ${group.id}`)
  for (const field of [
    'capabilityPaths',
    'profiles',
    'remaining',
    'evidence',
    'rowApi',
  ]) {
    if (!Array.isArray(group[field]) || !group[field].every(nonemptyString))
      throw new Error(`Invalid ${field} in compatibility evidence: ${group.id}`)
  }
  if (
    !group.profiles.length ||
    !group.evidence.length ||
    !nonemptyString(group.implemented) ||
    !group.remaining.length ||
    !nonemptyString(group.workstream)
  )
    throw new Error(`Incomplete compatibility evidence: ${group.id}`)
  for (const path of group.capabilityPaths) {
    if (!hasCapability(path))
      throw new Error(`Unknown capability path in ${group.id}: ${path}`)
  }
  for (const file of group.evidence) {
    const path = join(root, file)
    if (
      isAbsolute(file) ||
      relative(root, path).startsWith('..') ||
      !(await stat(path)).isFile()
    )
      throw new Error(`Invalid evidence file in ${group.id}: ${file}`)
  }
  for (const api of group.rowApi) {
    if (!keys.has(api))
      throw new Error(`Unknown reference API in ${group.id}: ${api}`)
    const groups = rowGroups.get(api) ?? []
    if (groups.includes(group.id))
      throw new Error(`Duplicate API in ${group.id}: ${api}`)
    groups.push(group.id)
    rowGroups.set(api, groups)
  }
}
const groupsById = new Map(evidence.groups.map((group) => [group.id, group]))
for (const row of rows) {
  row.declaration = availability(row)
  const groups = rowGroups.get(row.api) ?? []
  const claims = groups.map((id) => groupsById.get(id).status)
  row.implementation = {
    status:
      row.declaration.status === 'absent'
        ? 'missing'
        : claims.includes('partial')
          ? 'partial'
          : claims.includes('scoped')
            ? claims.every((status) => status === 'scoped')
              ? 'scoped'
              : 'partial'
            : claims.includes('missing')
              ? 'missing'
              : 'unreviewed',
    evidenceGroups: groups,
  }
}
function counts(items) {
  return Object.fromEntries(
    [...statuses].map((status) => [
      status,
      items.filter((item) => item === status).length,
    ])
  )
}
const inventory = {
  version: 2,
  reference: {
    version: '5.0.4',
    revision: '6a11cf66f99fa610b7364363d5ca42b66d994f40',
    integrity:
      'sha512-z0WxZRV2Sg48wF0FSgMq3TFG8JS38/Qr96vZVZdX6+Em9raQTvnXQvdTFJe2m3rfyJnEHeHQ/snceIdi8D1pVg==',
  },
  scope:
    'Pinned reference declarations plus reviewed Next implementation evidence. Declaration availability is an export/member shape check, not behavioral or type conformance. Implementation status applies only to the linked evidence groups and profiles. Missing or unverified release classifications remain blockers; unsupported-feature diagnostics do not complete functionality.',
  implementationStatus: evidence.implementationStatus,
  checkpoint: evidence.checkpoint,
  qualification: evidence.qualification,
  summary: {
    referenceApis: rows.length,
    declarations: {
      available: rows.filter((row) => row.declaration.status === 'available')
        .length,
      absent: rows.filter((row) => row.declaration.status === 'absent').length,
      notApplicable: rows.filter(
        (row) => row.declaration.status === 'not-applicable'
      ).length,
    },
    implementation: counts(rows.map((row) => row.implementation.status)),
    evidenceGroups: counts(evidence.groups.map((group) => group.status)),
    releaseCompatibleApis: rows.filter(
      (row) => row.classification === 'Compatible'
    ).length,
  },
  subpaths: Object.keys(manifest.exports).sort(),
  evidenceGroups: evidence.groups.map(({ rowApi: _, ...group }) => group),
  capabilities: rows,
}
const target = join(
  root,
  'packages/next/src/experimental/testing/compatibility-inventory.json'
)
const content = await prettier.format(JSON.stringify(inventory), {
  ...(await prettier.resolveConfig(target)),
  filepath: target,
})
if (process.argv.includes('--check')) {
  if ((await readFile(target, 'utf8')) !== content)
    throw new Error(
      'Compatibility inventory drifted. Run node scripts/next-testing-compatibility.mjs to regenerate and review the contract.'
    )
} else {
  await writeFile(target, content)
}
