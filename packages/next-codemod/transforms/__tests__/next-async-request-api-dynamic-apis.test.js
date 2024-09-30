/* global jest */
jest.autoMockOff()
const fs = require('fs')
const { defineTest, runInlineTest } = require('jscodeshift/dist/testUtils')
const { readdirSync } = require('fs')
const { join } = require('path')

function getSourceByInputPath(inputPath) {
  const possibleExtensions = ['ts', 'tsx', 'js', 'jsx']
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
  
    const inputPath = `../__testfixtures__/${prefix}.input`
    const inputSource = getSourceByInputPath(inputPath)
    const outputPath = `../__testfixtures__/${prefix}.output`
    const expectedOutput = getSourceByInputPath(outputPath)
    const transformPath = `../${transformName}`
    
    it(`transforms correctly ${prefix}`, () => {
      runInlineTest(
        require(transformPath), 
        null, 
        {
          path: 'page.js',
          source: inputSource,
        }, 
        expectedOutput, 
        {
          parser: isTsx ? 'tsx' : 'babel',
        }
      )
    })
  }
})
