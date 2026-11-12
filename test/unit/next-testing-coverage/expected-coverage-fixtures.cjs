const fs = require('node:fs')

const format = 'range-tuples-v1'
const names = {
  statements: 'statementMap',
  functions: 'fnMap',
  branches: 'branchMap',
}
const record = (value) =>
  value !== null && typeof value === 'object' && !Array.isArray(value)
const fields = (value, convert) =>
  Object.fromEntries(
    Object.entries(value).map(([key, item]) => [key, convert(item)])
  )

function sourceRange(value) {
  // Incomplete locations are intentional fixture inputs and remain objects.
  if (!Array.isArray(value)) return expandExpectedCoverageFixture(value)
  if (value.length !== 4)
    throw new Error('Expected coverage ranges require four coordinates')
  return {
    start: { line: value[0], column: value[1] },
    end: { line: value[2], column: value[3] },
  }
}

function locationFields(value, branch = false) {
  return Object.fromEntries(
    Object.entries(value).map(([key, item]) => [
      key,
      key === 'loc' || (!branch && key === 'decl')
        ? sourceRange(item)
        : branch && key === 'locations'
          ? item.map(sourceRange)
          : expandExpectedCoverageFixture(item),
    ])
  )
}

/** Expand fixture geometry, never observed reports or fresh compiler artifacts. */
function expandExpectedCoverageFixture(value) {
  if (Array.isArray(value)) return value.map(expandExpectedCoverageFixture)
  if (!record(value)) return value
  const compact = Object.hasOwn(value, '$coverage')
  if (compact) {
    if (value.$coverage !== format)
      throw new Error(
        'Unknown expected coverage fixture format: ' + value.$coverage
      )
    for (const key of ['statements', 'functions', 'branches', 's', 'f', 'b'])
      if (!Object.hasOwn(value, key) || !record(value[key]))
        throw new Error('Invalid expected coverage map field: ' + key)
    for (const key of Object.values(names))
      if (Object.hasOwn(value, key))
        throw new Error('Mixed expected coverage map formats')
  }
  return Object.fromEntries(
    Object.entries(value)
      .filter(([key]) => !compact || key !== '$coverage')
      .map(([key, item]) => [
        compact && Object.hasOwn(names, key) ? names[key] : key,
        compact && key === 'statements'
          ? fields(item, sourceRange)
          : compact && key === 'functions'
            ? fields(item, (value) => locationFields(value))
            : compact && key === 'branches'
              ? fields(item, (value) => locationFields(value, true))
              : expandExpectedCoverageFixture(item),
      ])
  )
}

// Preserve JSON.parse's postorder/holder semantics after coordinates acquire
// their original property names (including null column -> Infinity revivers).
function revive(holder, key, reviver) {
  const value = holder[key]
  if (
    value !== null &&
    (typeof value === 'object' || typeof value === 'function')
  ) {
    const keys = Array.isArray(value)
      ? Array.from({ length: value.length }, (_, index) => String(index))
      : Object.keys(value)
    for (const child of keys) {
      const next = revive(value, child, reviver)
      if (next === undefined) Reflect.deleteProperty(value, child)
      else
        Reflect.defineProperty(value, child, {
          value: next,
          writable: true,
          enumerable: true,
          configurable: true,
        })
    }
  }
  return Reflect.apply(reviver, holder, [key, value])
}

function parseExpectedCoverageFixture(text, reviver) {
  const value = expandExpectedCoverageFixture(JSON.parse(text))
  return typeof reviver === 'function'
    ? revive({ '': value }, '', reviver)
    : value
}

function readExpectedCoverageFixture(file, reviver) {
  return parseExpectedCoverageFixture(fs.readFileSync(file, 'utf8'), reviver)
}

function hasCompactMap(value) {
  return (
    (record(value) && Object.hasOwn(value, '$coverage')) ||
    (value !== null &&
      typeof value === 'object' &&
      Object.values(value).some(hasCompactMap))
  )
}

function expandedText(text) {
  if (!text.includes('"$coverage"') || !hasCompactMap(JSON.parse(text)))
    return text
  return JSON.stringify(parseExpectedCoverageFixture(text), null, 2) + '\n'
}

function readExpectedCoverageFixtureText(file) {
  return expandedText(fs.readFileSync(file, 'utf8'))
}

function copyExpectedCoverageFixture(source, target) {
  if (
    !String(source).endsWith('.json') &&
    !String(source).endsWith('.json.txt')
  )
    return fs.copyFileSync(source, target)
  const original = fs.readFileSync(source, 'utf8')
  const expanded = expandedText(original)
  if (expanded === original) return fs.copyFileSync(source, target)
  fs.writeFileSync(target, expanded)
}

module.exports = {
  expandExpectedCoverageFixture,
  parseExpectedCoverageFixture,
  readExpectedCoverageFixture,
  readExpectedCoverageFixtureText,
  copyExpectedCoverageFixture,
}
