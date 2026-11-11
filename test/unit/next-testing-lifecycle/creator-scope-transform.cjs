'use strict'
// Experimental general syntax transform. It never inspects a file/test/property name.
const { parse } = require('next/dist/compiled/babel/parser')
const { SourceMapGenerator } = require('next/dist/compiled/source-map')
function transform(code, filename) {
  const ast = parse(code, {
    sourceType: 'module',
    sourceFilename: filename,
    plugins: ['jsx', 'typescript'],
  })
  const identifiers = new Set(),
    nodes = [],
    relations = new WeakMap()
  function walk(value, parent, key) {
    if (!value || typeof value !== 'object') return
    if (Array.isArray(value)) {
      for (const item of value) walk(item, parent, key)
      return
    }
    if (typeof value.type !== 'string') return
    nodes.push({ node: value, parent, key })
    if (parent) relations.set(value, { parent, key })
    if (value.type === 'Identifier') identifiers.add(value.name)
    if (
      value.type === 'CallExpression' &&
      value.callee.type === 'Identifier' &&
      value.callee.name === 'eval'
    )
      throw new Error(
        'Creator capture HOLD: direct eval lexical transparency is not implemented'
      )
    for (const [childKey, child] of Object.entries(value))
      if (!['loc', 'tokens', 'comments', 'extra'].includes(childKey))
        walk(child, value, childKey)
  }
  walk(ast)
  let serial = 0
  function fresh(label) {
    let name
    do name = `__next_creator_${label}_${serial++}`
    while (identifiers.has(name))
    identifiers.add(name)
    return name
  }
  const capture = fresh('capture'),
    enter = fresh('enter'),
    inserts = new Map(),
    coverage = []
  const add = (at, text) => inserts.set(at, (inserts.get(at) || '') + text)
  const simple = (params) =>
    params.every(
      (param) =>
        param.type === 'Identifier' ||
        (param.type === 'RestElement' && param.argument.type === 'Identifier')
    )
  function body(node, cell) {
    if (!simple(node.params))
      throw new Error(
        'Creator capture HOLD: parameter initialization/destructuring requires a separate proof'
      )
    const leave = fresh('leave'),
      block = node.body
    const start = block.directives?.length
      ? block.directives.at(-1).end
      : block.start + 1
    add(start, `\nconst ${leave} = ${enter}(${cell}); try {\n`)
    add(block.end - 1, `\n} finally { ${leave}(); }\n`)
  }
  for (const { node, parent } of nodes) {
    if (node.type === 'ClassDeclaration') {
      if (!['Program', 'BlockStatement'].includes(parent?.type))
        throw new Error('Creator capture HOLD: class declaration placement')
      const methods = node.body.body.filter(
        (member) =>
          member.type === 'ClassMethod' &&
          member.kind !== 'constructor' &&
          !member.async &&
          !member.generator
      )
      if (!methods.length) continue
      // Capture before an entirely synchronous class evaluation. No suspension/eval
      // can change the creator frame between this point and method allocation.
      const queue = [
        node.superClass,
        ...node.body.body.map((member) =>
          member.computed ? member.key : null
        ),
      ]
      while (queue.length) {
        const item = queue.pop()
        if (!item || typeof item !== 'object') continue
        if (['AwaitExpression', 'YieldExpression'].includes(item.type))
          throw new Error('Creator capture HOLD: suspended class evaluation')
        for (const child of Object.values(item))
          if (Array.isArray(child)) queue.push(...child)
          else if (child && typeof child === 'object') queue.push(child)
      }
      const cell = fresh('class')
      add(node.start, `const ${cell} = ${capture}();\n`)
      for (const method of methods) {
        body(method, cell)
        coverage.push({
          kind: 'class-method',
          start: method.start,
          end: method.end,
        })
      }
    }
    if (node.type === 'ObjectExpression') {
      const methods = node.properties.filter(
        (member) =>
          member.type === 'ObjectMethod' && !member.async && !member.generator
      )
      if (!methods.length) continue
      let statement = node,
        relation = relations.get(statement)
      while (relation && !/Statement$|Declaration$/.test(statement.type)) {
        if (
          /Function|Method/.test(relation.parent.type) ||
          relation.parent.type === 'ArrowFunctionExpression'
        )
          throw new Error(
            'Creator capture HOLD: object method expression crosses a function boundary without a statement'
          )
        statement = relation.parent
        relation = relations.get(statement)
      }
      if (
        !relation ||
        ![
          'ExpressionStatement',
          'ReturnStatement',
          'VariableDeclaration',
          'ThrowStatement',
        ].includes(statement.type)
      )
        throw new Error(
          'Creator capture HOLD: object method creation placement'
        )
      // No await/yield may separate statement-local capture from this creation.
      function priorSuspension(value) {
        if (!value || typeof value !== 'object') return false
        if (Array.isArray(value)) return value.some(priorSuspension)
        if (
          ['AwaitExpression', 'YieldExpression'].includes(value.type) &&
          value.end <= node.start
        )
          return true
        // Suspended nested callable bodies do not execute during this creation.
        if (
          /Function|Method/.test(value.type || '') ||
          value.type === 'ArrowFunctionExpression'
        )
          return value.computed && priorSuspension(value.key)
        return Object.entries(value).some(
          ([key, child]) =>
            !['loc', 'tokens', 'comments', 'extra'].includes(key) &&
            priorSuspension(child)
        )
      }
      if (priorSuspension(statement))
        throw new Error(
          'Creator capture HOLD: suspension precedes object creation'
        )
      const cell = fresh('object')
      if (
        relation.parent.type === 'BlockStatement' ||
        relation.parent.type === 'Program'
      )
        add(statement.start, `const ${cell} = ${capture}();\n`)
      else {
        add(statement.start, `{ const ${cell} = ${capture}();\n`)
        add(statement.end, '\n}')
      }
      for (const method of methods) {
        body(method, cell)
        coverage.push({
          kind: 'object-method',
          start: method.start,
          end: method.end,
        })
      }
    }
    if (
      node.type === 'ReturnStatement' &&
      node.argument?.type === 'FunctionExpression' &&
      !node.argument.async &&
      !node.argument.generator
    ) {
      const cell = fresh('function')
      if (parent?.type === 'BlockStatement') {
        add(node.start, `const ${cell} = ${capture}();\n`)
      } else {
        // A sole return has no declaration/hoisting effect. Give only its new
        // capture a lexical block while preserving its original ReturnStatement.
        add(node.start, `{ const ${cell} = ${capture}();\n`)
        add(node.end, '\n}')
      }
      body(node.argument, cell)
      coverage.push({
        kind: 'returned-function',
        start: node.argument.start,
        end: node.argument.end,
      })
    }
  }
  if (!coverage.length) return { code, map: undefined, coverage }
  const first = ast.program.interpreter ? ast.program.interpreter.end : 0
  add(
    first,
    `\nimport { captureCreatorScope as ${capture}, enterCreatorScope as ${enter} } from 'next/dist/experimental/testing/client/async-context';\n`
  )
  let result = '',
    generatedLine = 1,
    generatedColumn = 0,
    originalLine = 1,
    originalColumn = 0
  const map = new SourceMapGenerator({ file: filename })
  const append = (text) => {
    result += text
    for (const char of text) {
      if (char === '\n') {
        generatedLine++
        generatedColumn = 0
      } else generatedColumn++
    }
  }
  for (let i = 0; i <= code.length; i++) {
    if (inserts.has(i)) append(inserts.get(i))
    if (i === code.length) break
    map.addMapping({
      generated: { line: generatedLine, column: generatedColumn },
      original: { line: originalLine, column: originalColumn },
      source: filename,
    })
    append(code[i])
    if (code[i] === '\n') {
      originalLine++
      originalColumn = 0
    } else originalColumn++
  }
  map.setSourceContent(filename, code)
  return { code: result, map: JSON.parse(map.toString()), coverage }
}
module.exports = { transform }
