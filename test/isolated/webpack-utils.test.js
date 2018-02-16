/* global describe, it, expect */

import {normalize} from 'path'
import {getPageEntries, createEntry} from '../../dist/server/build/webpack/utils'

describe('createEntry', () => {
  it('Should turn a path into a page entry', () => {
    const entry = createEntry('pages/index.js')
    expect(entry.name).toBe(normalize('bundles/pages/index.js'))
    expect(entry.files[0]).toBe('./pages/index.js')
  })

  it('Should have a custom name', () => {
    const entry = createEntry('pages/index.js', {name: 'something-else.js'})
    expect(entry.name).toBe(normalize('bundles/something-else.js'))
    expect(entry.files[0]).toBe('./pages/index.js')
  })

  it('Should allow custom extension like .ts to be turned into .js', () => {
    const entry = createEntry('pages/index.ts', {pageExtensions: ['js', 'ts'].join('|')})
    expect(entry.name).toBe(normalize('bundles/pages/index.js'))
    expect(entry.files[0]).toBe('./pages/index.ts')
  })

  it('Should allow custom extension like .jsx to be turned into .js', () => {
    const entry = createEntry('pages/index.jsx', {pageExtensions: ['jsx', 'js'].join('|')})
    expect(entry.name).toBe(normalize('bundles/pages/index.js'))
    expect(entry.files[0]).toBe('./pages/index.jsx')
  })

  it('Should turn pages/blog/index.js into pages/blog.js', () => {
    const entry = createEntry('pages/blog/index.js')
    expect(entry.name).toBe(normalize('bundles/pages/blog.js'))
    expect(entry.files[0]).toBe('./pages/blog/index.js')
  })
})

describe('getPageEntries', () => {
  it('Should return paths', () => {
    const pagePaths = ['pages/index.js']
    const pageEntries = getPageEntries(pagePaths)
    expect(pageEntries[normalize('bundles/pages/index.js')][0]).toBe('./pages/index.js')
  })

  it('Should include default _error', () => {
    const pagePaths = ['pages/index.js']
    const pageEntries = getPageEntries(pagePaths)
    expect(pageEntries[normalize('bundles/pages/_error.js')][0]).toMatch(/dist[/\\]pages[/\\]_error\.js/)
  })

  it('Should not include default _error when _error.js is inside the pages directory', () => {
    const pagePaths = ['pages/index.js', 'pages/_error.js']
    const pageEntries = getPageEntries(pagePaths)
    expect(pageEntries[normalize('bundles/pages/_error.js')][0]).toBe('./pages/_error.js')
  })

  it('Should include default _document when isServer is true', () => {
    const pagePaths = ['pages/index.js']
    const pageEntries = getPageEntries(pagePaths, {isServer: true})
    expect(pageEntries[normalize('bundles/pages/_document.js')][0]).toMatch(/dist[/\\]pages[/\\]_document\.js/)
  })

  it('Should not include default _document when _document.js is inside the pages directory', () => {
    const pagePaths = ['pages/index.js', 'pages/_document.js']
    const pageEntries = getPageEntries(pagePaths, {isServer: true})
    expect(pageEntries[normalize('bundles/pages/_document.js')][0]).toBe('./pages/_document.js')
  })
})
