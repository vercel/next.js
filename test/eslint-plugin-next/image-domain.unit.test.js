/* eslint-env jest */
const rule = require('@next/eslint-plugin-next/lib/rules/image-domain')
const { Linter } = require('eslint')
const assert = require('assert')
const path = require('path')

const linter = new Linter({ cwd: __dirname })
const baseDir = `${__dirname}/custom-image`
const linterConfig = {
  parserOptions: {
    ecmaVersion: 2018,
    sourceType: 'module',
    ecmaFeatures: {
      modules: true,
      jsx: true,
    },
  },
}

linter.defineRules({
  'image-domain': rule,
})

const code = `
  import Image from 'next/image'

  export const Blah = () => (
      <Image
        src="https://example.com/test.png"
        width={500}
        height={500}
      />
  );
`

describe('image-domain', function () {
  it('valid external image with loader specified', function () {
    linterConfig.rules = {
      'image-domain': [2, path.join(baseDir, 'next.config.loader.js')],
    }

    const report = linter.verify(code, linterConfig)
    assert.deepEqual(report, [])
  })

  it('valid external image with domain specified', function () {
    linterConfig.rules = {
      'image-domain': [2, path.join(baseDir, 'next.config.domain.js')],
    }

    const report = linter.verify(code, linterConfig)
    assert.deepEqual(report, [])
  })

  it('invalid external image without domain or loader specified', function () {
    linterConfig.rules = {
      'image-domain': 2,
    }

    const [report] = linter.verify(code, linterConfig)

    assert.notEqual(report, undefined, 'No lint errors found.')
    assert.equal(
      report.message,
      'No domain or loader is specified in next.config.js for example.com. See https://nextjs.org/docs/messages/image-domain.'
    )
  })
})
