/* eslint-env jest */
import rule from '@next/eslint-plugin-next/dist/rules/no-html-link-for-pages'
import { Linter } from 'eslint'
import assert from 'assert'
import path from 'path'

const withCustomPagesDirectory = path.join(__dirname, 'with-custom-pages-dir')

const withoutPagesLinter = new Linter({
  cwd: path.join(__dirname, 'without-pages-dir'),
})
const withAppLinter = new Linter({
  cwd: path.join(__dirname, 'with-app-dir'),
})
const withCustomPagesLinter = new Linter({
  cwd: withCustomPagesDirectory,
})

const linterConfig: any = {
  rules: {
    'no-html-link-for-pages': [2],
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
const linterConfigWithCustomDirectory: any = {
  ...linterConfig,
  rules: {
    'no-html-link-for-pages': [
      2,
      path.join(withCustomPagesDirectory, 'custom-pages'),
    ],
  },
}
const linterConfigWithMultipleDirectories = {
  ...linterConfig,
  rules: {
    'no-html-link-for-pages': [
      2,
      [
        path.join(withCustomPagesDirectory, 'custom-pages'),
        path.join(withCustomPagesDirectory, 'custom-pages/list'),
      ],
    ],
  },
}

withoutPagesLinter.defineRules({
  'no-html-link-for-pages': rule,
})
withAppLinter.defineRules({
  'no-html-link-for-pages': rule,
})
withCustomPagesLinter.defineRules({
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
  it('prints warning when there are no "pages" or "app" directories', function () {
    const consoleSpy = jest.spyOn(console, 'warn').mockImplementation()
    withoutPagesLinter.verify(validCode, linterConfig, {
      filename: 'foo.js',
    })
    const rootDirectory = path.join(__dirname, 'without-pages-dir')
    expect(consoleSpy).toHaveBeenCalledWith(
      `Pages directory cannot be found at ${path.join(
        rootDirectory,
        'pages'
      )} or ${path.join(
        rootDirectory,
        'src',
        'pages'
      )}. If using a custom path, please configure with the \`no-html-link-for-pages\` rule in your eslint config file.`
    )

    consoleSpy.mockRestore()
  })
  it('does not print warning when there is "app" directory and no "pages" directory', function () {
    const consoleSpy = jest.spyOn(console, 'warn').mockImplementation()
    withAppLinter.verify(validCode, linterConfig, {
      filename: 'foo.js',
    })
    expect(consoleSpy).not.toHaveBeenCalled()

    consoleSpy.mockRestore()
  })
  it('valid link element', function () {
    const report = withCustomPagesLinter.verify(
      validCode,
      linterConfigWithCustomDirectory,
      {
        filename: 'foo.js',
      }
    )
    assert.deepEqual(report, [])
  })

  it('valid link element with multiple directories', function () {
    const report = withCustomPagesLinter.verify(
      validCode,
      linterConfigWithMultipleDirectories,
      {
        filename: 'foo.js',
      }
    )
    assert.deepEqual(report, [])
  })

  it('valid anchor element', function () {
    const report = withCustomPagesLinter.verify(
      validAnchorCode,
      linterConfigWithCustomDirectory,
      {
        filename: 'foo.js',
      }
    )
    assert.deepEqual(report, [])
  })

  it('valid external link element', function () {
    const report = withCustomPagesLinter.verify(
      validExternalLinkCode,
      linterConfigWithCustomDirectory,
      {
        filename: 'foo.js',
      }
    )
    assert.deepEqual(report, [])
  })

  it('valid download link element', function () {
    const report = withCustomPagesLinter.verify(
      validDownloadLinkCode,
      linterConfigWithCustomDirectory,
      {
        filename: 'foo.js',
      }
    )
    assert.deepEqual(report, [])
  })

  it('valid target="_blank" link element', function () {
    const report = withCustomPagesLinter.verify(
      validTargetBlankLinkCode,
      linterConfigWithCustomDirectory,
      {
        filename: 'foo.js',
      }
    )
    assert.deepEqual(report, [])
  })

  it('valid public file link element', function () {
    const report = withCustomPagesLinter.verify(
      validPublicFile,
      linterConfigWithCustomDirectory,
      {
        filename: 'foo.js',
      }
    )
    assert.deepEqual(report, [])
  })

  it('invalid static route', function () {
    const [report] = withCustomPagesLinter.verify(
      invalidStaticCode,
      linterConfigWithCustomDirectory,
      {
        filename: 'foo.js',
      }
    )
    assert.notEqual(report, undefined, 'No lint errors found.')
    assert.equal(
      report.message,
      'Do not use an `<a>` element to navigate to `/`. Use `<Link />` from `next/link` instead. See: https://nextjs.org/docs/messages/no-html-link-for-pages'
    )
  })

  it('invalid dynamic route', function () {
    const [report] = withCustomPagesLinter.verify(
      invalidDynamicCode,
      linterConfigWithCustomDirectory,
      {
        filename: 'foo.js',
      }
    )
    assert.notEqual(report, undefined, 'No lint errors found.')
    assert.equal(
      report.message,
      'Do not use an `<a>` element to navigate to `/list/foo/bar/`. Use `<Link />` from `next/link` instead. See: https://nextjs.org/docs/messages/no-html-link-for-pages'
    )
    const [secondReport] = withCustomPagesLinter.verify(
      secondInvalidDynamicCode,
      linterConfigWithCustomDirectory,
      {
        filename: 'foo.js',
      }
    )
    assert.notEqual(secondReport, undefined, 'No lint errors found.')
    assert.equal(
      secondReport.message,
      'Do not use an `<a>` element to navigate to `/list/foo/`. Use `<Link />` from `next/link` instead. See: https://nextjs.org/docs/messages/no-html-link-for-pages'
    )
    const [thirdReport] = withCustomPagesLinter.verify(
      thirdInvalidDynamicCode,
      linterConfigWithCustomDirectory,
      {
        filename: 'foo.js',
      }
    )
    assert.notEqual(thirdReport, undefined, 'No lint errors found.')
    assert.equal(
      thirdReport.message,
      'Do not use an `<a>` element to navigate to `/list/lorem-ipsum/`. Use `<Link />` from `next/link` instead. See: https://nextjs.org/docs/messages/no-html-link-for-pages'
    )
  })
})
