import type { PluginLanguageService } from '../test-utils'

import ts from 'typescript'
import { join, relative } from 'node:path'
import { getPluginLanguageService, getTsFiles } from '../test-utils'

type PartialDiagnostic = Pick<
  ts.Diagnostic,
  'code' | 'messageText' | 'start' | 'length'
>

const fixturesDir = join(__dirname, 'app/warn-no-type')

describe('typescript-plugin - metadata - warn-no-type', () => {
  let languageService: PluginLanguageService

  beforeAll(() => {
    languageService = getPluginLanguageService(__dirname)
  })

  it('should not have diagnostics for metadata with type', () => {
    const hasTypeDir = join(fixturesDir, 'metadata', 'has-type')
    const tsFiles = getTsFiles(hasTypeDir)
    const totalDiagnostics: Record<string, PartialDiagnostic[]> = {}

    for (const tsFile of tsFiles) {
      // This test expects no diagnostics, but if somehow the test
      // detects one and fails, the diagnostics output on the terminal
      // is too long and omits the filename, so we filter out only the
      // necessary properties for debugging.
      totalDiagnostics[relative(__dirname, tsFile)] = languageService
        .getSemanticDiagnostics(tsFile)
        .map((diagnostic) => ({
          code: diagnostic.code,
          messageText: diagnostic.messageText,
          start: diagnostic.start,
          length: diagnostic.length,
        }))
    }

    expect(totalDiagnostics).toMatchInlineSnapshot(
      `
     {
       "app/warn-no-type/metadata/has-type/export-inline-from-next/layout.tsx": [],
       "app/warn-no-type/metadata/has-type/export-inline-from-next/page.tsx": [],
       "app/warn-no-type/metadata/has-type/export-inline-from-other/layout.tsx": [],
       "app/warn-no-type/metadata/has-type/export-inline-from-other/page.tsx": [],
       "app/warn-no-type/metadata/has-type/export-separate-from-next/layout.tsx": [],
       "app/warn-no-type/metadata/has-type/export-separate-from-next/page.tsx": [],
       "app/warn-no-type/metadata/has-type/export-separate-from-other/layout.tsx": [],
       "app/warn-no-type/metadata/has-type/export-separate-from-other/page.tsx": [],
     }
    `
    )
  })

  it('should not have diagnostics for generateMetadata with type', () => {
    const hasTypeDir = join(fixturesDir, 'generate-metadata', 'has-type')
    const tsFiles = getTsFiles(hasTypeDir)
    const totalDiagnostics: Record<string, PartialDiagnostic[]> = {}

    for (const tsFile of tsFiles) {
      // This test expects no diagnostics, but if somehow the test
      // detects one and fails, the diagnostics output on the terminal
      // is too long and omits the filename, so we filter out only the
      // necessary properties for debugging.
      totalDiagnostics[relative(__dirname, tsFile)] = languageService
        .getSemanticDiagnostics(tsFile)
        .map((diagnostic) => ({
          code: diagnostic.code,
          messageText: diagnostic.messageText,
          start: diagnostic.start,
          length: diagnostic.length,
        }))
    }

    expect(totalDiagnostics).toMatchInlineSnapshot(`
     {
       "app/warn-no-type/generate-metadata/has-type/export-inline-from-next-async-arrow-function/layout.tsx": [],
       "app/warn-no-type/generate-metadata/has-type/export-inline-from-next-async-arrow-function/page.tsx": [],
       "app/warn-no-type/generate-metadata/has-type/export-inline-from-next-async-function-expression/layout.tsx": [],
       "app/warn-no-type/generate-metadata/has-type/export-inline-from-next-async-function-expression/page.tsx": [],
       "app/warn-no-type/generate-metadata/has-type/export-inline-from-next-async-function/layout.tsx": [],
       "app/warn-no-type/generate-metadata/has-type/export-inline-from-next-async-function/page.tsx": [],
       "app/warn-no-type/generate-metadata/has-type/export-inline-from-next-sync-arrow-function/layout.tsx": [],
       "app/warn-no-type/generate-metadata/has-type/export-inline-from-next-sync-arrow-function/page.tsx": [],
       "app/warn-no-type/generate-metadata/has-type/export-inline-from-next-sync-function-expression/layout.tsx": [],
       "app/warn-no-type/generate-metadata/has-type/export-inline-from-next-sync-function-expression/page.tsx": [],
       "app/warn-no-type/generate-metadata/has-type/export-inline-from-next-sync-function/layout.tsx": [],
       "app/warn-no-type/generate-metadata/has-type/export-inline-from-next-sync-function/page.tsx": [],
       "app/warn-no-type/generate-metadata/has-type/export-inline-from-other-async-arrow-function/layout.tsx": [],
       "app/warn-no-type/generate-metadata/has-type/export-inline-from-other-async-arrow-function/page.tsx": [],
       "app/warn-no-type/generate-metadata/has-type/export-inline-from-other-async-function-expression/layout.tsx": [],
       "app/warn-no-type/generate-metadata/has-type/export-inline-from-other-async-function-expression/page.tsx": [],
       "app/warn-no-type/generate-metadata/has-type/export-inline-from-other-async-function/layout.tsx": [],
       "app/warn-no-type/generate-metadata/has-type/export-inline-from-other-async-function/page.tsx": [],
       "app/warn-no-type/generate-metadata/has-type/export-inline-from-other-sync-arrow-function/layout.tsx": [],
       "app/warn-no-type/generate-metadata/has-type/export-inline-from-other-sync-arrow-function/page.tsx": [],
       "app/warn-no-type/generate-metadata/has-type/export-inline-from-other-sync-function-expression/layout.tsx": [],
       "app/warn-no-type/generate-metadata/has-type/export-inline-from-other-sync-function-expression/page.tsx": [],
       "app/warn-no-type/generate-metadata/has-type/export-inline-from-other-sync-function/layout.tsx": [],
       "app/warn-no-type/generate-metadata/has-type/export-inline-from-other-sync-function/page.tsx": [],
       "app/warn-no-type/generate-metadata/has-type/export-separate-from-next-async-arrow-function/layout.tsx": [],
       "app/warn-no-type/generate-metadata/has-type/export-separate-from-next-async-arrow-function/page.tsx": [],
       "app/warn-no-type/generate-metadata/has-type/export-separate-from-next-async-function-expression/layout.tsx": [],
       "app/warn-no-type/generate-metadata/has-type/export-separate-from-next-async-function-expression/page.tsx": [],
       "app/warn-no-type/generate-metadata/has-type/export-separate-from-next-async-function/layout.tsx": [],
       "app/warn-no-type/generate-metadata/has-type/export-separate-from-next-async-function/page.tsx": [],
       "app/warn-no-type/generate-metadata/has-type/export-separate-from-next-sync-arrow-function/layout.tsx": [],
       "app/warn-no-type/generate-metadata/has-type/export-separate-from-next-sync-arrow-function/page.tsx": [],
       "app/warn-no-type/generate-metadata/has-type/export-separate-from-next-sync-function-expression/layout.tsx": [],
       "app/warn-no-type/generate-metadata/has-type/export-separate-from-next-sync-function-expression/page.tsx": [],
       "app/warn-no-type/generate-metadata/has-type/export-separate-from-next-sync-function/layout.tsx": [],
       "app/warn-no-type/generate-metadata/has-type/export-separate-from-next-sync-function/page.tsx": [],
       "app/warn-no-type/generate-metadata/has-type/export-separate-from-other-async-arrow-function/layout.tsx": [],
       "app/warn-no-type/generate-metadata/has-type/export-separate-from-other-async-arrow-function/page.tsx": [],
       "app/warn-no-type/generate-metadata/has-type/export-separate-from-other-async-function-expression/layout.tsx": [],
       "app/warn-no-type/generate-metadata/has-type/export-separate-from-other-async-function-expression/page.tsx": [],
       "app/warn-no-type/generate-metadata/has-type/export-separate-from-other-async-function/layout.tsx": [],
       "app/warn-no-type/generate-metadata/has-type/export-separate-from-other-async-function/page.tsx": [],
       "app/warn-no-type/generate-metadata/has-type/export-separate-from-other-sync-arrow-function/layout.tsx": [],
       "app/warn-no-type/generate-metadata/has-type/export-separate-from-other-sync-arrow-function/page.tsx": [],
       "app/warn-no-type/generate-metadata/has-type/export-separate-from-other-sync-function-expression/layout.tsx": [],
       "app/warn-no-type/generate-metadata/has-type/export-separate-from-other-sync-function-expression/page.tsx": [],
       "app/warn-no-type/generate-metadata/has-type/export-separate-from-other-sync-function/layout.tsx": [],
       "app/warn-no-type/generate-metadata/has-type/export-separate-from-other-sync-function/page.tsx": [],
     }
    `)
  })

  it('should have diagnostics for metadata with no type', () => {
    const noTypeDir = join(fixturesDir, 'metadata', 'no-type')
    const tsFiles = getTsFiles(noTypeDir)
    const totalDiagnostics: Record<string, PartialDiagnostic[]> = {}

    for (const tsFile of tsFiles) {
      totalDiagnostics[relative(__dirname, tsFile)] = languageService
        .getSemanticDiagnostics(tsFile)
        .map((diagnostic) => ({
          code: diagnostic.code,
          messageText: diagnostic.messageText,
          start: diagnostic.start,
          length: diagnostic.length,
        }))
    }

    expect(totalDiagnostics).toMatchInlineSnapshot(`
     {
       "app/warn-no-type/metadata/no-type/export-inline/layout.tsx": [
         {
           "code": 71008,
           "length": 8,
           "messageText": "The Next.js "metadata" export should be type of "Metadata" from "next".",
           "start": 119,
         },
       ],
       "app/warn-no-type/metadata/no-type/export-inline/page.tsx": [
         {
           "code": 71008,
           "length": 8,
           "messageText": "The Next.js "metadata" export should be type of "Metadata" from "next".",
           "start": 77,
         },
       ],
       "app/warn-no-type/metadata/no-type/export-separate/layout.tsx": [
         {
           "code": 71008,
           "length": 8,
           "messageText": "The Next.js "metadata" export should be type of "Metadata" from "next".",
           "start": 158,
         },
       ],
       "app/warn-no-type/metadata/no-type/export-separate/page.tsx": [
         {
           "code": 71008,
           "length": 8,
           "messageText": "The Next.js "metadata" export should be type of "Metadata" from "next".",
           "start": 116,
         },
       ],
     }
    `)
  })

  it('should have diagnostics for generateMetadata with no type', () => {
    const noTypeDir = join(fixturesDir, 'generate-metadata', 'no-type')
    const tsFiles = getTsFiles(noTypeDir)
    const totalDiagnostics: Record<string, PartialDiagnostic[]> = {}

    for (const tsFile of tsFiles) {
      totalDiagnostics[relative(__dirname, tsFile)] = languageService
        .getSemanticDiagnostics(tsFile)
        .map((diagnostic) => ({
          code: diagnostic.code,
          messageText: diagnostic.messageText,
          start: diagnostic.start,
          length: diagnostic.length,
        }))
    }

    expect(totalDiagnostics).toMatchInlineSnapshot(`
     {
       "app/warn-no-type/generate-metadata/no-type/export-inline-async-arrow-function/layout.tsx": [
         {
           "code": 71008,
           "length": 16,
           "messageText": "The Next.js "generateMetadata" export should have a return type of "Promise<Metadata>" from "next".",
           "start": 119,
         },
       ],
       "app/warn-no-type/generate-metadata/no-type/export-inline-async-arrow-function/page.tsx": [
         {
           "code": 71008,
           "length": 16,
           "messageText": "The Next.js "generateMetadata" export should have a return type of "Promise<Metadata>" from "next".",
           "start": 77,
         },
       ],
       "app/warn-no-type/generate-metadata/no-type/export-inline-async-function-expression/layout.tsx": [
         {
           "code": 71008,
           "length": 16,
           "messageText": "The Next.js "generateMetadata" export should have a return type of "Promise<Metadata>" from "next".",
           "start": 119,
         },
       ],
       "app/warn-no-type/generate-metadata/no-type/export-inline-async-function-expression/page.tsx": [
         {
           "code": 71008,
           "length": 16,
           "messageText": "The Next.js "generateMetadata" export should have a return type of "Promise<Metadata>" from "next".",
           "start": 77,
         },
       ],
       "app/warn-no-type/generate-metadata/no-type/export-inline-async-function/layout.tsx": [
         {
           "code": 71008,
           "length": 16,
           "messageText": "The Next.js "generateMetadata" export should have a return type of "Promise<Metadata>" from "next".",
           "start": 128,
         },
       ],
       "app/warn-no-type/generate-metadata/no-type/export-inline-async-function/page.tsx": [
         {
           "code": 71008,
           "length": 16,
           "messageText": "The Next.js "generateMetadata" export should have a return type of "Promise<Metadata>" from "next".",
           "start": 86,
         },
       ],
       "app/warn-no-type/generate-metadata/no-type/export-inline-sync-arrow-function/layout.tsx": [
         {
           "code": 71008,
           "length": 16,
           "messageText": "The Next.js "generateMetadata" export should have a return type of "Metadata" from "next".",
           "start": 119,
         },
       ],
       "app/warn-no-type/generate-metadata/no-type/export-inline-sync-arrow-function/page.tsx": [
         {
           "code": 71008,
           "length": 16,
           "messageText": "The Next.js "generateMetadata" export should have a return type of "Metadata" from "next".",
           "start": 77,
         },
       ],
       "app/warn-no-type/generate-metadata/no-type/export-inline-sync-function-expression/layout.tsx": [
         {
           "code": 71008,
           "length": 16,
           "messageText": "The Next.js "generateMetadata" export should have a return type of "Metadata" from "next".",
           "start": 119,
         },
       ],
       "app/warn-no-type/generate-metadata/no-type/export-inline-sync-function-expression/page.tsx": [
         {
           "code": 71008,
           "length": 16,
           "messageText": "The Next.js "generateMetadata" export should have a return type of "Metadata" from "next".",
           "start": 77,
         },
       ],
       "app/warn-no-type/generate-metadata/no-type/export-inline-sync-function/layout.tsx": [
         {
           "code": 71008,
           "length": 16,
           "messageText": "The Next.js "generateMetadata" export should have a return type of "Metadata" from "next".",
           "start": 122,
         },
       ],
       "app/warn-no-type/generate-metadata/no-type/export-inline-sync-function/page.tsx": [
         {
           "code": 71008,
           "length": 16,
           "messageText": "The Next.js "generateMetadata" export should have a return type of "Metadata" from "next".",
           "start": 80,
         },
       ],
       "app/warn-no-type/generate-metadata/no-type/export-separate-async-arrow-function/layout.tsx": [
         {
           "code": 71008,
           "length": 16,
           "messageText": "The Next.js "generateMetadata" export should have a return type of "Promise<Metadata>" from "next".",
           "start": 204,
         },
       ],
       "app/warn-no-type/generate-metadata/no-type/export-separate-async-arrow-function/page.tsx": [
         {
           "code": 71008,
           "length": 16,
           "messageText": "The Next.js "generateMetadata" export should have a return type of "Promise<Metadata>" from "next".",
           "start": 162,
         },
       ],
       "app/warn-no-type/generate-metadata/no-type/export-separate-async-function-expression/layout.tsx": [
         {
           "code": 71008,
           "length": 16,
           "messageText": "The Next.js "generateMetadata" export should have a return type of "Promise<Metadata>" from "next".",
           "start": 210,
         },
       ],
       "app/warn-no-type/generate-metadata/no-type/export-separate-async-function-expression/page.tsx": [
         {
           "code": 71008,
           "length": 16,
           "messageText": "The Next.js "generateMetadata" export should have a return type of "Promise<Metadata>" from "next".",
           "start": 168,
         },
       ],
       "app/warn-no-type/generate-metadata/no-type/export-separate-async-function/layout.tsx": [
         {
           "code": 71008,
           "length": 16,
           "messageText": "The Next.js "generateMetadata" export should have a return type of "Promise<Metadata>" from "next".",
           "start": 201,
         },
       ],
       "app/warn-no-type/generate-metadata/no-type/export-separate-async-function/page.tsx": [
         {
           "code": 71008,
           "length": 16,
           "messageText": "The Next.js "generateMetadata" export should have a return type of "Promise<Metadata>" from "next".",
           "start": 159,
         },
       ],
       "app/warn-no-type/generate-metadata/no-type/export-separate-sync-arrow-function/layout.tsx": [
         {
           "code": 71008,
           "length": 16,
           "messageText": "The Next.js "generateMetadata" export should have a return type of "Metadata" from "next".",
           "start": 198,
         },
       ],
       "app/warn-no-type/generate-metadata/no-type/export-separate-sync-arrow-function/page.tsx": [
         {
           "code": 71008,
           "length": 16,
           "messageText": "The Next.js "generateMetadata" export should have a return type of "Metadata" from "next".",
           "start": 156,
         },
       ],
       "app/warn-no-type/generate-metadata/no-type/export-separate-sync-function-expression/layout.tsx": [
         {
           "code": 71008,
           "length": 16,
           "messageText": "The Next.js "generateMetadata" export should have a return type of "Metadata" from "next".",
           "start": 204,
         },
       ],
       "app/warn-no-type/generate-metadata/no-type/export-separate-sync-function-expression/page.tsx": [
         {
           "code": 71008,
           "length": 16,
           "messageText": "The Next.js "generateMetadata" export should have a return type of "Metadata" from "next".",
           "start": 162,
         },
       ],
       "app/warn-no-type/generate-metadata/no-type/export-separate-sync-function/layout.tsx": [
         {
           "code": 71008,
           "length": 16,
           "messageText": "The Next.js "generateMetadata" export should have a return type of "Metadata" from "next".",
           "start": 195,
         },
       ],
       "app/warn-no-type/generate-metadata/no-type/export-separate-sync-function/page.tsx": [
         {
           "code": 71008,
           "length": 16,
           "messageText": "The Next.js "generateMetadata" export should have a return type of "Metadata" from "next".",
           "start": 153,
         },
       ],
     }
    `)
  })
})
