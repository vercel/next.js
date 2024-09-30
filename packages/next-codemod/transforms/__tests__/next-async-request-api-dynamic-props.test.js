/* global jest */
jest.autoMockOff()
const fs = require('fs')
const path = require('path')
const { defineTest, defineInlineTest } = require('jscodeshift/dist/testUtils')
const { readdirSync } = require('fs')
const { join } = require('path')

const possibleExtensions = ['ts', 'tsx', 'js', 'jsx']

function getSourceByInputPath(inputPath) {
  let source = ''
  for (const ext of possibleExtensions) {
    if (fs.existsSync(`${inputPath}.${ext}`)) {
      source = fs.readFileSync(`${inputPath}.${ext}`, 'utf8')
      break
    }
  }
  return source   
}

const testFileRegex = /\.input\.(j|t)sx?$/

const fixtureDir = 'next-async-request-api-dynamic-props'
const transformName = 'next-async-request-api'
const fixtureDirPath = join(__dirname, '..', '__testfixtures__', fixtureDir)
const fixtures = readdirSync(fixtureDirPath)
  .filter(file => testFileRegex.test(file))

describe('next-async-request-api - dynamic-props', () => {
  for (const file of fixtures) {
    const isTsx = file.endsWith('.tsx')
    const fixture = file.replace(testFileRegex, '')
    const prefix = `${fixtureDir}/${fixture}`;
    const inputPath = `../__testfixtures__/${prefix}.input`
    const inputSource = getSourceByInputPath(inputPath)
    const outputPath = `../__testfixtures__/${prefix}.output`
    const expectedOutput = getSourceByInputPath(outputPath)
    const transformPath = `../${transformName}`
    const transform = require(transformPath).default

    const wrappedTransform = (fileInfo, api, options) => {
      const { path: filePath } = fileInfo
      const modifiedFileInfo = {
        ...fileInfo,
        path: /^origin-name-/.test(filePath) ? filePath : 'page.tsx',
      }
      return transform(modifiedFileInfo, api, options)
    }
    
    defineInlineTest(
      wrappedTransform,
      {},
      inputSource,
      expectedOutput,
      `transforms correctly ${prefix}`
    )
  }
})
