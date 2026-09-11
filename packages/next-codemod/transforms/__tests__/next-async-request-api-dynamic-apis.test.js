/* global jest */
jest.autoMockOff()
const fs = require('fs')
const path = require('path')
const { defineTest, defineInlineTest, runInlineTest } = require('jscodeshift/dist/testUtils')
const { readdirSync } = require('fs')
const { join } = require('path')

const possibleExtensions = ['ts', 'tsx', 'js', 'jsx']

function getSourceByInputPath(inputPath) {
  let source = ''
  let filePath
  for (const ext of possibleExtensions) {
    const currentPath = `${inputPath}.${ext}`
    if (fs.existsSync(currentPath)) {
      filePath = currentPath
      source = fs.readFileSync(`${inputPath}.${ext}`, 'utf8')
      break
    }
  }
  return [filePath, source]
}

const testFileRegex = /\.input\.(j|t)sx?$/

const fixtureDir = 'next-async-request-api-dynamic-apis'
const transformName = 'next-async-request-api'
const fixtureDirPath = join(__dirname, '..', '__testfixtures__', fixtureDir)
const fixtures = readdirSync(fixtureDirPath)
  .filter(file => testFileRegex.test(file))

describe('next-async-request-api - dynamic-apis', () => {
  for (const file of fixtures) {
    const isTsx = file.endsWith('.tsx')
    const fixture = file.replace(testFileRegex, '')
    const prefix = `${fixtureDir}/${fixture}`;
    const [inputPath, input] = getSourceByInputPath(path.join(`${__dirname}`, `../__testfixtures__/${prefix}.input`))
    const [outputPath, expectedOutput] = getSourceByInputPath(path.join(`${__dirname}`, `../__testfixtures__/${prefix}.output`))
    const extension = path.extname(inputPath)

    const transformPath = `${__dirname}/../${transformName}`
    const transform = require(transformPath).default

    // Override test fixture input filename with `page.tsx` to always match the expected output,
    // otherwise fallback to the original filename.
    const overrideFilename = /[\\/]origin-name-\d{2}-/.test(inputPath) 
      // extract the <name> from `origin-name-<name>-<number>.input.js`
      ? inputPath
        .replace(/origin-name-(\d{2})-/, '')
        .replace(/\.input\./, '.')
      : 'page' + extension

    it(`transforms correctly ${prefix}`, () => {
      runInlineTest(
        transform,
        null,
        {
          path: overrideFilename,
          source: input,
        },
        expectedOutput, 
        {
          parser: isTsx ? 'tsx' : 'babel',
        },
      )
    })
  }
})

describe('unfinished async migration markers', () => {
  const transform = require('../next-async-request-api').default
  const j = require('jscodeshift').withParser('tsx')
  const apply = source => transform({ path: 'lib/viewer.ts', source }, { jscodeshift: j, j }, {})

  it('marks contextual helper repair and does not duplicate it on a second pass', () => {
    const source = "import { cookies } from 'next/headers'; export function readViewer() { return cookies().get('viewer')?.value }"
    const once = apply(source)
    expect(once).toContain('@next-codemod-error')
    expect(once).toContain('UnsafeUnwrappedCookies')
    const twice = apply(once) || once
    expect((twice.match(/@next-codemod-error/g) || []).length).toBe(1)
    expect((twice.match(/as unknown as UnsafeUnwrappedCookies/g) || []).length).toBe(1)
  })

  it('preserves an explicitly documented ignore on a repeated pass', () => {
    const source = "import { cookies, type UnsafeUnwrappedCookies } from 'next/headers'; export function readViewer() { return (/* @next-codemod-ignore Verified exception in fixture. */ cookies() as unknown as UnsafeUnwrappedCookies).get('viewer')?.value }"
    const output = apply(source) || source
    expect(output).toContain('@next-codemod-ignore')
    expect(output).not.toContain('@next-codemod-error')
  })

  it('uses the same marker for a dynamic import requiring contextual review', () => {
    const output = apply("export async function readViewer() { const { cookies } = await import('next/headers'); return cookies().get('viewer') }")
    expect(output).toContain('@next-codemod-error')
  })
})
