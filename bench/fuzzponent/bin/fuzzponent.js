#!/usr/bin/env node
const path = require('path')
const fs = require('fs')

const getSequenceGenerator = require('random-seed')
const generate = require('@babel/generator').default
const t = require('@babel/types')

const MIN_COMPONENT_NAME_LEN = 18
const MAX_COMPONENT_NAME_LEN = 24
const MIN_CHILDREN = 4
const MAX_CHILDREN = 80

const arrayUntil = (len) => [...Array(len)].map((_, i) => i)

const generateFunctionalComponentModule = (componentName, children = []) => {
  const body = [
    generateImport('React', 'react'),
    ...children.map((childName) => generateImport(childName, `./${childName}`)),
    t.variableDeclaration('const', [
      t.variableDeclarator(
        t.identifier(componentName),
        t.arrowFunctionExpression(
          [],
          t.parenthesizedExpression(
            generateJSXElement(
              'div',
              children.map((childName) => generateJSXElement(childName))
            )
          )
        )
      ),
    ]),
    t.exportDefaultDeclaration(t.identifier(componentName)),
  ]

  return t.program(body, [], 'module')
}

const generateJSXElement = (componentName, children = null) =>
  t.JSXElement(
    t.JSXOpeningElement(t.JSXIdentifier(componentName), [], !children),
    children ? t.JSXClosingElement(t.JSXIdentifier(componentName)) : null,
    children || [],
    !children
  )

const generateImport = (componentName, requireString) =>
  t.importDeclaration(
    [t.importDefaultSpecifier(t.identifier(componentName))],
    t.stringLiteral(requireString)
  )

const validFirstChars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'
const validOtherChars = validFirstChars.toLowerCase()
function generateComponentName(seqGenerator, opts) {
  const numOtherChars = seqGenerator.intBetween(opts.minLen, opts.maxLen)
  const firstChar = validFirstChars[seqGenerator.range(validFirstChars.length)]
  const otherChars = arrayUntil(numOtherChars).map(
    () => validOtherChars[seqGenerator.range(validOtherChars.length)]
  )
  return `${firstChar}${otherChars.join('')}`
}

function* generateModules(name, remainingDepth, seqGenerator, opts) {
  const filename = `${name}.${opts.extension}`
  let ast

  if (name === 'index') {
    name = 'RootComponent'
  }

  if (remainingDepth === 0) {
    ast = generateFunctionalComponentModule(name)
  } else {
    const numChildren = seqGenerator.intBetween(opts.minChild, opts.maxChild)
    const children = arrayUntil(numChildren).map(() =>
      generateComponentName(seqGenerator, opts)
    )
    ast = generateFunctionalComponentModule(name, children)

    for (const child of children) {
      yield* generateModules(child, remainingDepth - 1, seqGenerator, opts)
    }
  }

  yield {
    filename,
    content: generate(ast).code,
  }
}

function generateFuzzponents(outdir, seed, depth, opts) {
  const seqGenerator = getSequenceGenerator(seed)

  const filenames = new Set()
  for (const { filename, content } of generateModules(
    'index',
    depth,
    seqGenerator,
    opts
  )) {
    if (filenames.has(filename)) {
      throw new Error(
        `Seed "${seed}" generates output with filename collisions.`
      )
    } else {
      filenames.add(filename)
    }
    const fpath = path.join(outdir, filename)
    fs.writeFileSync(fpath, `// ${filename}\n\n${content}`)
  }
}

if (require.main === module) {
  const { outdir, seed, depth, ...opts } = require('yargs')
    .option('depth', {
      alias: 'd',
      demandOption: true,
      describe: 'component hierarchy depth',
      type: 'number',
    })
    .option('seed', {
      alias: 's',
      demandOption: true,
      describe: 'prng seed',
      type: 'number',
    })
    .option('outdir', {
      alias: 'o',
      demandOption: false,
      default: process.cwd(),
      describe: 'the directory where components should be written',
      type: 'string',
      normalize: true,
    })
    .option('minLen', {
      demandOption: false,
      default: MIN_COMPONENT_NAME_LEN,
      describe: 'the smallest acceptable component name length',
      type: 'number',
    })
    .option('maxLen', {
      demandOption: false,
      default: MAX_COMPONENT_NAME_LEN,
      describe: 'the largest acceptable component name length',
      type: 'number',
    })
    .option('minLen', {
      demandOption: false,
      default: MIN_COMPONENT_NAME_LEN,
      describe: 'the smallest acceptable component name length',
      type: 'number',
    })
    .option('maxLen', {
      demandOption: false,
      default: MAX_COMPONENT_NAME_LEN,
      describe: 'the largest acceptable component name length',
      type: 'number',
    })
    .option('minChild', {
      demandOption: false,
      default: MIN_CHILDREN,
      describe: 'the smallest number of acceptable component children',
      type: 'number',
    })
    .option('maxChild', {
      demandOption: false,
      default: MAX_CHILDREN,
      describe: 'the largest number of acceptable component children',
      type: 'number',
    })
    .option('extension', {
      default: 'jsx',
      describe: 'extension to use for generated components',
      type: 'string',
    }).argv

  fs.mkdirSync(outdir, { recursive: true })
  generateFuzzponents(outdir, seed, depth, opts)
}

module.exports = generateFuzzponents
