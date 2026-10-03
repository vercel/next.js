/* global jest */
jest.autoMockOff()
const { defineTest, runInlineTest } = require('jscodeshift/dist/testUtils')

const fixtures = [
  'link-a',
  'move-props',
  'custom-component-child',
  'custom-component-child-legacy-behavior',
  'links-with-legacybehavior-prop',
  'children-interpolation',
  'spread-props',
  'link-string',
  'styled-jsx',
  'handle-duplicate-props'
]

for (const fixture of fixtures) {
  defineTest(
    __dirname,
    'new-link',
    null,
    `new-link/${fixture}`
  )
}

const lineEndingInputLines = [
  "import Link from 'next/link'",
  '',
  'export default function Page() {',
  '  return (',
  '    <Link href="/about">',
  '      <a>About</a>',
  '    </Link>',
  '  )',
  '}',
  '',
]

const lineEndingOutputLines = [
  "import Link from 'next/link'",
  '',
  'export default function Page() {',
  '  return (',
  '    (<Link href="/about">',
  '      About',
  '    </Link>)',
  '  );',
  '}',
  '',
]

describe('line endings', () => {
  it('preserves LF line endings', () => {
    const source = lineEndingInputLines.join('\n')
    const expectedOutput = lineEndingOutputLines.join('\n')
    const transformPath = `${__dirname}/../new-link`
    const transform = require(transformPath).default
    const output = runInlineTest(
      transform,
      null,
      { path: 'page.js', source },
      expectedOutput
    )

    expect(output).toContain('\n')
    expect(output).not.toContain('\r\n')
  })

  it('preserves CRLF line endings', () => {
    const source = lineEndingInputLines.join('\r\n')
    const expectedOutput = lineEndingOutputLines.join('\r\n')
    const transformPath = `${__dirname}/../new-link`
    const transform = require(transformPath).default
    const output = runInlineTest(
      transform,
      null,
      { path: 'page.js', source },
      expectedOutput
    )

    expect(output).toContain('\r\n')
    expect(output.replace(/\r\n/g, '')).not.toContain('\n')
  })
})
