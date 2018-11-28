/* eslint-env jest */

import {normalize, join} from 'path'
import {getPageEntries, createEntry} from 'next/dist/build/webpack/utils'

const buildId = 'development'

describe('createEntry', () => {
  it('Should turn a path into a page entry', () => {
    const entry = createEntry('pages/index.js')
    expect(entry.name).toBe(normalize(`static/pages/index.js`))
    expect(entry.files[0]).toBe('./pages/index.js')
  })

  it('Should have a custom name', () => {
    const entry = createEntry('pages/index.js', {name: 'something-else.js'})
    expect(entry.name).toBe(normalize(`static/something-else.js`))
    expect(entry.files[0]).toBe('./pages/index.js')
  })

  it('Should allow custom extension like .ts to be turned into .js', () => {
    const entry = createEntry('pages/index.ts', {pageExtensions: ['js', 'ts'].join('|')})
    expect(entry.name).toBe(normalize('static/pages/index.js'))
    expect(entry.files[0]).toBe('./pages/index.ts')
  })

  it('Should allow custom extension like .jsx to be turned into .js', () => {
    const entry = createEntry('pages/index.jsx', {pageExtensions: ['jsx', 'js'].join('|')})
    expect(entry.name).toBe(normalize('static/pages/index.js'))
    expect(entry.files[0]).toBe('./pages/index.jsx')
  })

  it('Should allow custom extension like .tsx to be turned into .js', () => {
    const entry = createEntry('pages/index.tsx', {pageExtensions: ['tsx', 'ts'].join('|')})
    expect(entry.name).toBe(normalize('static/pages/index.js'))
    expect(entry.files[0]).toBe('./pages/index.tsx')
  })

  it('Should allow custom extension like .tsx to be turned into .js with another order', () => {
    const entry = createEntry('pages/index.tsx', {pageExtensions: ['ts', 'tsx'].join('|')})
    expect(entry.name).toBe(normalize('static/pages/index.js'))
    expect(entry.files[0]).toBe('./pages/index.tsx')
  })

  it('Should turn pages/blog/index.js into pages/blog.js', () => {
    const entry = createEntry('pages/blog/index.js')
    expect(entry.name).toBe(normalize('static/pages/blog.js'))
    expect(entry.files[0]).toBe('./pages/blog/index.js')
  })

  it('Should add buildId when provided', () => {
    const entry = createEntry('pages/blog/index.js', {buildId})
    expect(entry.name).toBe(normalize(`static/${buildId}/pages/blog.js`))
    expect(entry.files[0]).toBe('./pages/blog/index.js')
  })
})

describe('getPageEntries', () => {
  const nextPagesDir = join(__dirname, '..', '..', 'dist', 'pages')

  it('Should return paths', () => {
    const pagePaths = ['pages/index.js']
    const pageEntries = getPageEntries(pagePaths, {nextPagesDir})
    expect(pageEntries[normalize('static/pages/index.js')][0]).toBe('./pages/index.js')
  })

  it('Should include default _error', () => {
    const pagePaths = ['pages/index.js']
    const pageEntries = getPageEntries(pagePaths, {nextPagesDir})
    expect(pageEntries[normalize('static/pages/_error.js')][0]).toMatch(/dist[/\\]pages[/\\]_error\.js/)
  })

  it('Should not include default _error when _error.js is inside the pages directory', () => {
    const pagePaths = ['pages/index.js', 'pages/_error.js']
    const pageEntries = getPageEntries(pagePaths, {nextPagesDir})
    expect(pageEntries[normalize('static/pages/_error.js')][0]).toBe('./pages/_error.js')
  })

  it('Should include default _document when isServer is true', () => {
    const pagePaths = ['pages/index.js']
    const pageEntries = getPageEntries(pagePaths, {nextPagesDir, isServer: true})
    expect(pageEntries[normalize('static/pages/_document.js')][0]).toMatch(/dist[/\\]pages[/\\]_document\.js/)
  })

  it('Should not include default _document when _document.js is inside the pages directory', () => {
    const pagePaths = ['pages/index.js', 'pages/_document.js']
    const pageEntries = getPageEntries(pagePaths, {nextPagesDir, isServer: true})
    expect(pageEntries[normalize('static/pages/_document.js')][0]).toBe('./pages/_document.js')
  })
})
