import assert from 'node:assert/strict'

// Capture only public reporter objects supplied by the actual runtime.
export function observeSuites(module) {
  assert.equal(module.type, 'module')
  return [...module.children.allSuites()].map((suite) => {
    const ancestry = [],
      seen = new Set()
    let current = suite
    while (current !== module) {
      assert(
        current && current.type === 'suite',
        'Suite ancestry must end at its actual module'
      )
      assert.equal(current.module, module, 'Suite belongs to another module')
      assert(!seen.has(current), 'Cyclic public suite ancestry')
      seen.add(current)
      assert.equal(typeof current.id, 'string')
      assert.equal(typeof current.name, 'string')
      ancestry.unshift({ id: current.id, name: current.name })
      current = current.parent
    }
    return {
      id: suite.id,
      name: suite.name,
      moduleId: module.id,
      parentId: suite.parent.id,
      ancestry,
      moduleIdentityMatches: suite.module === module,
    }
  })
}

// No identifier syntax is interpreted. Unknown log task IDs stay untouched.
export function observedTaskIdentities(files) {
  const ids = new Map()
  const put = (id, label) => {
    assert(
      typeof id === 'string' && id.length > 0,
      'Observed identity requires a nonempty ID'
    )
    assert(!ids.has(id), 'Duplicate observed task ID')
    ids.set(id, label)
  }
  for (const file of files) {
    put(file.id, '<file>')
    for (const test of file.tests) put(test.id, test.name)
    assert(
      Array.isArray(file.suites),
      'Version2 requires actual suite observations'
    )
    const suites = new Map(),
      paths = new Set()
    for (const suite of file.suites) {
      assert.equal(suite.moduleId, file.id, 'Suite module ownership mismatch')
      assert.equal(suite.moduleIdentityMatches, true)
      assert.equal(typeof suite.name, 'string')
      assert(!suites.has(suite.id), 'Duplicate observed suite ID')
      suites.set(suite.id, suite)
    }
    for (const suite of file.suites) {
      assert(Array.isArray(suite.ancestry) && suite.ancestry.length > 0)
      const ancestry = suite.ancestry
      assert.deepEqual(ancestry.at(-1), { id: suite.id, name: suite.name })
      assert.equal(
        suite.parentId,
        ancestry.length === 1 ? file.id : ancestry.at(-2).id
      )
      const seen = new Set()
      ancestry.forEach((ancestor, index) => {
        assert(!seen.has(ancestor.id), 'Cyclic observed suite IDs')
        seen.add(ancestor.id)
        const actual = suites.get(ancestor.id)
        assert(actual, 'Unobserved suite ancestor')
        assert.equal(
          actual.name,
          ancestor.name,
          'Observed ancestor name mismatch'
        )
        assert.deepEqual(
          actual.ancestry,
          ancestry.slice(0, index + 1),
          'Observed ancestor chain mismatch'
        )
      })
      const logicalPath = JSON.stringify(
        ancestry.map((ancestor) => ancestor.name)
      )
      assert(!paths.has(logicalPath), 'Ambiguous observed suite ancestry')
      paths.add(logicalPath)
      put(suite.id, '<suite:' + logicalPath + '>')
    }
  }
  return ids
}
