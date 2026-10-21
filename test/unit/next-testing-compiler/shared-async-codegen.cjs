const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

const repo = path.resolve(__dirname, '../../..')
const fixture = fs.mkdtempSync(path.join(repo, '.next-test-shared-async-'))
const source = path.join(__dirname, 'shared-async')
for (const file of fs.readdirSync(source))
  fs.copyFileSync(
    path.join(source, file),
    path.join(fixture, file.replace(/\.txt$/, ''))
  )
fs.symlinkSync(
  path.join(repo, 'node_modules'),
  path.join(fixture, 'node_modules')
)
fs.mkdirSync(path.join(fixture, 'app'))
fs.writeFileSync(
  path.join(fixture, 'app/layout.jsx'),
  'export default function Layout({children}) {return <html><body>{children}</body></html>}\n'
)
fs.writeFileSync(
  path.join(fixture, 'app/page.jsx'),
  'export default function Page(){return null}\n'
)
fs.writeFileSync(path.join(fixture, 'next.config.mjs'), 'export default {}\n')
process.env.NODE_ENV = 'development'
process.env.NEXT_TELEMETRY_DISABLED = '1'
delete process.env.CI
const next = path.join(repo, 'packages/next/dist')
require(path.join(next, 'server/node-environment-baseline'))
const { createTestCompilerSession } = require(
  path.join(next, 'experimental/testing/compiler')
)
const { parse } = require(path.join(next, 'build/swc'))

function visit(node, callback) {
  if (!node || typeof node !== 'object') return
  callback(node)
  for (const value of Object.values(node)) {
    if (Array.isArray(value)) {
      for (const item of value) visit(item, callback)
    } else visit(value, callback)
  }
}
function argument(node) {
  while (node?.expression) node = node.expression
  return node
}
function memberCall(node, context, property) {
  return (
    node.type === 'CallExpression' &&
    node.callee.type === 'MemberExpression' &&
    node.callee.object.type === 'Identifier' &&
    node.callee.object.value === context &&
    node.callee.property.type === 'Identifier' &&
    node.callee.property.value === property
  )
}
function parameter(node) {
  return (node?.pat ?? node)?.value
}

;(async () => {
  let session
  try {
    const profile = {
      id: 'shared-async-codegen',
      environment: 'browser',
      browserClient: true,
      mode: 'development',
      runtime: 'nodejs',
      bundler: 'turbopack',
    }
    session = await createTestCompilerSession(fixture, profile)
    const artifact = await session.compile(
      { id: 'codegen', file: path.join(fixture, 'contract.test.mjs'), profile },
      {
        signal: new AbortController().signal,
        setupFiles: [path.join(fixture, 'setup.mjs')],
      }
    )
    const factories = []
    for (const file of artifact.files) {
      if (!file.endsWith('.js')) continue
      const ast = await parse(
        fs.readFileSync(path.join(artifact.rootDir, file), 'utf8'),
        {
          filename: file,
        }
      )
      visit(ast, (node) => {
        if (node.type !== 'ArrayExpression') return
        const elements = node.elements.map(argument)
        for (let index = 0; index < elements.length; index++) {
          const id = elements[index]
          if (id?.type !== 'StringLiteral') continue
          let following = index + 1
          while (elements[following]?.type === 'StringLiteral') following++
          const factory = elements[following]
          if (
            factory?.type === 'ArrowFunctionExpression' ||
            factory?.type === 'FunctionExpression'
          )
            factories.push({ id: id.value, factory })
        }
      })
    }
    const wrappers = factories.filter(({ id }) =>
      id.includes('/setup.mjs.next-test-setup.mjs ')
    )
    assert(
      wrappers.length > 0,
      'Actual native namespace wrapper is emitted: ' +
        JSON.stringify(factories.map(({ id }) => id))
    )
    let inherited = false
    for (const { factory } of wrappers) {
      const context = parameter(factory.params[0])
      const imports = new Map()
      visit(factory, (node) => {
        if (
          node.type === 'VariableDeclarator' &&
          node.id.type === 'Identifier' &&
          node.init &&
          memberCall(node.init, context, 'i')
        ) {
          const request = argument(node.init.arguments[0])
          if (request?.type === 'StringLiteral')
            imports.set(node.id.value, request.value)
        }
      })
      visit(factory, (node) => {
        if (!memberCall(node, context, 'a')) return
        const body = argument(node.arguments[0])
        const handler = parameter(body.params[0])
        visit(body, (child) => {
          if (
            child.type !== 'CallExpression' ||
            child.callee.type !== 'Identifier' ||
            child.callee.value !== handler
          )
            return
          const dependencies = argument(child.arguments[0])
          if (dependencies?.type !== 'ArrayExpression') return
          for (const dependency of dependencies.elements.map(argument)) {
            const request = imports.get(dependency?.value)
            if (request?.includes('/setup.mjs [next-test-client]'))
              inherited = true
          }
        })
      })
    }
    assert(
      inherited,
      'Shared ESM wrapper must await the actual async setup subject'
    )
    const harness = factories.find(({ id }) =>
      id.includes('/dist/esm/build/templates/client-test.js ')
    )
    assert(harness, 'Actual compiler harness is emitted')
    const context = parameter(harness.factory.params[0])
    let asyncHarness = false
    const lazyRequires = new Set()
    visit(harness.factory, (node) => {
      if (memberCall(node, context, 'a')) asyncHarness = true
      if (memberCall(node, context, 'r')) {
        const request = argument(node.arguments[0])
        if (request?.type === 'StringLiteral') {
          if (request.value.includes('/setup.mjs.next-test-setup.mjs '))
            lazyRequires.add('setup')
          if (request.value.includes('/contract.test.mjs '))
            lazyRequires.add('test')
        }
      }
    })
    assert.equal(
      asyncHarness,
      false,
      'Shared CJS requires must not inherit async evaluation'
    )
    assert.deepEqual([...lazyRequires].sort(), ['setup', 'test'])
    console.log(
      'NEXT_TEST_SHARED_ASYNC_CODEGEN ' +
        JSON.stringify({
          actualNativeCodegen: true,
          sharedSubjectAwaited: true,
          noninheritingCjsRequires: [...lazyRequires].sort(),
          harnessAsync: false,
        })
    )
  } finally {
    await session?.dispose()
    fs.rmSync(fixture, { recursive: true, force: true })
  }
})().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
