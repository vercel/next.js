import { parseModule } from 'next/dist/build/analysis/parse-module'
import { extractImportModules } from 'next/dist/build/analysis/extract-import-modules'

describe('extract import modules', () => {
  it('basic import', async () => {
    const parsed = await parseModule(
      'virtual_fixture/basic-import.js',
      `
      import Script from 'next/script'
      import Image from 'next/future/image'
    `
    )
    expect(extractImportModules(parsed)).toEqual([
      'next/script',
      'next/future/image',
    ])
  })

  it('dynamic import', async () => {
    const parsed = await parseModule(
      'virtual_fixture/dynamic-import.js',
      `
      import dynamic from 'next/dynamic'
      import { lazy } from 'react'
      const Script = lazy(() => import('next/script'))
      const Image = dynamic(() => import('next/image'), { suspense: true })
    `
    )
    expect(extractImportModules(parsed)).toEqual([
      'next/dynamic',
      'react',
      'next/script',
      'next/image',
    ])
  })

  it('type import', async () => {
    const parsed = await parseModule(
      'virtual_fixture/type-import.tsx',
      `
      import { type ImportDeclaration, parseModule } from '@swc/core'
      import type { Visitor } from '@swc/core/Visitor'
    `
    )
    expect(extractImportModules(parsed)).toEqual(['@swc/core'])
    expect(extractImportModules(parsed, false)).toEqual([
      '@swc/core',
      '@swc/core/Visitor',
    ])
  })

  it('node require', async () => {
    const parsed = await parseModule(
      'virtual_fixture/node-require.js',
      `
      const Script = require('next/script')

      function Example() {
        const Image = require('next/image')
      }

      const Head = dynamic(() => Promise.resolve(require('next/head')))
    `
    )

    expect(extractImportModules(parsed)).toEqual([
      'next/script',
      'next/image',
      'next/head',
    ])
  })
})
