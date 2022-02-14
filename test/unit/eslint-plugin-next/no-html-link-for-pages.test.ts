/* eslint-env jest */
import rule from '@next/eslint-plugin-next/lib/rules/no-html-link-for-pages'
import { Linter } from 'eslint'
import assert from 'assert'
import path from 'path'

const linter = new Linter({ cwd: __dirname })
const linterConfig: any = {
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

const validDownloadLinkCode = `
import Link from 'next/link';

export class Blah extends Head {
  render() {
    return (
      <div>
        <a href='/static-file.csv' download>Download</a>
        <h1>Hello title</h1>
      </div>
    );
  }
}
`
const validTargetBlankLinkCode = `
import Link from 'next/link';

export class Blah extends Head {
  render() {
    return (
      <div>
        <a target="_blank" href='/new-tab'>New Tab</a>
        <h1>Hello title</h1>
      </div>
    );
  }
}
`

const validPublicFile = `
import Link from 'next/link';

export class Blah extends Head {
  render() {
    return (
      <div>
        <a href='/presentation.pdf'>View PDF</a>
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
        <a href='/list/foo/bar'>Homepage</a>
        <h1>Hello title</h1>
      </div>
    );
  }
}
`
const secondInvalidDynamicCode = `
import Link from 'next/link';

export class Blah extends Head {
  render() {
    return (
      <div>
        <a href='/list/foo/'>Homepage</a>
        <h1>Hello title</h1>
      </div>
    );
  }
}
`

const thirdInvalidDynamicCode = `
import Link from 'next/link';

export class Blah extends Head {
  render() {
    return (
      <div>
        <a href='/list/lorem-ipsum/'>Homepage</a>
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

  it('valid download link element', function () {
    const report = linter.verify(validDownloadLinkCode, linterConfig, {
      filename: 'foo.js',
    })
    assert.deepEqual(report, [])
  })

  it('valid target="_blank" link element', function () {
    const report = linter.verify(validTargetBlankLinkCode, linterConfig, {
      filename: 'foo.js',
    })
    assert.deepEqual(report, [])
  })

  it('valid public file link element', function () {
    const report = linter.verify(validPublicFile, linterConfig, {
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
      'Do not use an `<a>` element to navigate to `/`. Use `<Link />` from `next/link` instead. See: https://nextjs.org/docs/messages/no-html-link-for-pages'
    )
  })

  it('invalid dynamic route', function () {
    const [report] = linter.verify(invalidDynamicCode, linterConfig, {
      filename: 'foo.js',
    })
    assert.notEqual(report, undefined, 'No lint errors found.')
    assert.equal(
      report.message,
      'Do not use an `<a>` element to navigate to `/list/foo/bar/`. Use `<Link />` from `next/link` instead. See: https://nextjs.org/docs/messages/no-html-link-for-pages'
    )
    const [secondReport] = linter.verify(
      secondInvalidDynamicCode,
      linterConfig,
      {
        filename: 'foo.js',
      }
    )
    assert.notEqual(secondReport, undefined, 'No lint errors found.')
    assert.equal(
      secondReport.message,
      'Do not use an `<a>` element to navigate to `/list/foo/`. Use `<Link />` from `next/link` instead. See: https://nextjs.org/docs/messages/no-html-link-for-pages'
    )
    const [thirdReport] = linter.verify(thirdInvalidDynamicCode, linterConfig, {
      filename: 'foo.js',
    })
    assert.notEqual(thirdReport, undefined, 'No lint errors found.')
    assert.equal(
      thirdReport.message,
      'Do not use an `<a>` element to navigate to `/list/lorem-ipsum/`. Use `<Link />` from `next/link` instead. See: https://nextjs.org/docs/messages/no-html-link-for-pages'
    )
  })
})
