import fs from 'fs'
import os from 'os'
import path from 'path'
import { createRouteTypesManifest } from './route-types-utils'
import type { NextConfigComplete } from '../../config-shared'
import type { RouteTypesManifest } from './route-types-utils'
import type {
  RootParamInfo,
  RootParamValueType,
} from './root-params-type-utils'
import {
  generateRootParamsTypes,
  writeRootParamsTypes,
} from './root-params-type-utils'

describe('root-params-type-utils', () => {
  it('should generate unions for params with mixed runtime shapes', () => {
    const output = generateRootParamsTypes(
      new Map([
        ['id', createInfo('string', 'string[]', 'undefined')],
        ['locale', createInfo('string')],
        ['slug', createInfo('string[]', 'undefined')],
      ])
    )

    expect(output).toMatchInlineSnapshot(`
     "// Type definitions for Next.js root params (next/root-params)

     declare module 'next/root-params' {
       export function id(): Promise<string | string[] | undefined>
       export function locale(): Promise<string>
       export function slug(): Promise<string[] | undefined>
     }
     "
    `)
  })

  it('should collect mixed root param shapes from layouts', async () => {
    const manifest = await createRouteTypesManifest({
      dir: '/tmp',
      pageRoutes: [],
      appRoutes: [],
      appRouteHandlers: [],
      pageApiRoutes: [],
      layoutRoutes: [
        { route: '/[id]', filePath: '/tmp/app/[id]/layout.tsx' },
        {
          route: '/docs/[...id]',
          filePath: '/tmp/app/docs/[...id]/layout.tsx',
        },
      ],
      slots: [],
    })

    expect(manifest.rootParams).toEqual(
      new Map([['id', createInfo('string', 'string[]')]])
    )
  })

  it('should delete stale type files when the feature is disabled', async () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'next-root-params-'))
    const filePath = path.join(tempDir, 'root-params.d.ts')
    fs.writeFileSync(filePath, 'stale')

    await writeRootParamsTypes(
      createManifest(new Map([['lang', createInfo('string')]])),
      filePath,
      {
        experimental: {
          rootParams: false,
        },
        cacheComponents: false,
      } as NextConfigComplete
    )

    expect(fs.existsSync(filePath)).toBe(false)

    fs.rmSync(tempDir, { recursive: true, force: true })
  })

  it('should write a placeholder when the feature is enabled but there are no root params', async () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'next-root-params-'))
    const filePath = path.join(tempDir, 'root-params.d.ts')

    await writeRootParamsTypes(createManifest(new Map()), filePath, {
      experimental: {
        rootParams: true,
      },
      cacheComponents: false,
    } as NextConfigComplete)

    expect(fs.existsSync(filePath)).toBe(true)
    expect(fs.readFileSync(filePath, 'utf8')).toContain('export {}')

    fs.rmSync(tempDir, { recursive: true, force: true })
  })
})

function createManifest(
  rootParams: RouteTypesManifest['rootParams']
): RouteTypesManifest {
  return {
    appRoutes: {},
    pageRoutes: {},
    layoutRoutes: {},
    appRouteHandlerRoutes: {},
    redirectRoutes: {},
    rewriteRoutes: {},
    appPagePaths: new Set(),
    pagesRouterPagePaths: new Set(),
    layoutPaths: new Set(),
    appRouteHandlers: new Set(),
    pageApiRoutes: new Set(),
    filePathToRoute: new Map(),
    rootParams,
  }
}

function createInfo(...valueTypes: RootParamValueType[]): RootParamInfo {
  return new Set(valueTypes)
}
