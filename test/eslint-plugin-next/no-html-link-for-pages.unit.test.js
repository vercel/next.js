/* eslint-env jest */
const rule = require('@next/eslint-plugin-next/lib/rules/no-html-link-for-pages')
const { Linter } = require('eslint')
const assert = require('assert')
const path = require('path')

const linter = new Linter({ cwd: __dirname })
const linterConfig = {
  rules: {
    'no-html-link-for-pages': [2, path.join(__dirname, 'custom-pages')],
  },
  parserOptions: {
    ecmaVersion: 2018,
    sourceType: 'module',
    ecmaFeatures: {
      modules: true,
      jsx: true,
    },
  },
}
const linterConfigWithMultipleDirectories = {
  ...linterConfig,
  rules: {
    'no-html-link-for-pages': [
      2,
      [
        path.join(__dirname, 'custom-pages'),
        path.join(__dirname, 'custom-pages/list'),
      ],
    ],
  },
}

linter.defineRules({
  'no-html-link-for-pages': rule,
})

const validCode = `
import Link from 'next/link';

export class Blah extends Head {
  render() {
    return (
      <div>
        <Link href='/'>
          <a>Homepage</a>
        </Link>
        <h1>Hello title</h1>
      </div>
    );
  }
}
`

const validAnchorCode = `
import Link from 'next/link';

export class Blah extends Head {
  render() {
    return (
      <div>
        <a href='#heading'>Homepage</a>
        <h1>Hello title</h1>
      </div>
    );
  }
}
`

const validExternalLinkCode = `
import Link from 'next/link';

export class Blah extends Head {
  render() {
    return (
      <div>
        <a href='https://google.com/'>Homepage</a>
        <h1>Hello title</h1>
      </div>
    );
  }
}
`

const invalidStaticCode = `
import Link from 'next/link';

export class Blah extends Head {
  render() {
    return (
      <div>
        <a href='/'>Homepage</a>
        <h1>Hello title</h1>
      </div>
    );
  }
}
`

const invalidDynamicCode = `
import Link from 'next/link';

export class Blah extends Head {
  render() {
    return (
      <div>
        <a href='/list/blah'>Homepage</a>
        <h1>Hello title</h1>
      </div>
    );
  }
}
`

describe('no-html-link-for-pages', function () {
  it('valid link element', function () {
    const report = linter.verify(validCode, linterConfig, {
      filename: 'foo.js',
    })
    assert.deepEqual(report, [])
  })

  it('valid link element with multiple directories', function () {
    const report = linter.verify(
      validCode,
      linterConfigWithMultipleDirectories,
      {
        filename: 'foo.js',
      }
    )
    assert.deepEqual(report, [])
  })

  it('valid anchor element', function () {
    const report = linter.verify(validAnchorCode, linterConfig, {
      filename: 'foo.js',
    })
    assert.deepEqual(report, [])
  })

  it('valid external link element', function () {
    const report = linter.verify(validExternalLinkCode, linterConfig, {
      filename: 'foo.js',
    })
    assert.deepEqual(report, [])
  })

  it('invalid static route', function () {
    const [report] = linter.verify(invalidStaticCode, linterConfig, {
      filename: 'foo.js',
    })
    assert.notEqual(report, undefined, 'No lint errors found.')
    assert.equal(
      report.message,
      "Do not use the HTML <a> tag to navigate to /. Use Link from 'next/link' instead. See: https://nextjs.org/docs/messages/no-html-link-for-pages."
    )
  })

  it('invalid dynamic route', function () {
    const [report] = linter.verify(invalidDynamicCode, linterConfig, {
      filename: 'foo.js',
    })
    assert.notEqual(report, undefined, 'No lint errors found.')
    assert.equal(
      report.message,
      "Do not use the HTML <a> tag to navigate to /list/blah/. Use Link from 'next/link' instead. See: https://nextjs.org/docs/messages/no-html-link-for-pages."
    )
  })
})
