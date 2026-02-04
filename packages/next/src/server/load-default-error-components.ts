import type { BuildManifest } from './get-page-files'

import { BUILD_MANIFEST } from '../shared/lib/constants'
import { join } from 'path'
import { interopDefault } from '../lib/interop-default'
import { getTracer } from './lib/trace/tracer'
import { LoadComponentsSpan } from './lib/trace/constants'
import {
  loadManifestWithRetries,
  type LoadComponentsReturnType,
} from './load-components'
export type ManifestItem = {
  id: number | string
  files: string[]
}

export type ReactLoadableManifest = { [moduleId: string]: ManifestItem }

export type ErrorModule = typeof import('./route-modules/pages/builtin/_error')

async function loadDefaultErrorComponentsImpl(
  distDir: string
): Promise<LoadComponentsReturnType<ErrorModule>> {
  // eslint-disable-next-line @next/internal/typechecked-require -- Why not relative imports?
  const Document = interopDefault(require('next/dist/pages/_document'))
  // eslint-disable-next-line @next/internal/typechecked-require -- Why not relative imports?
  const AppMod = require('next/dist/pages/_app')
  const App = interopDefault(AppMod)

  // Load the compiled route module for this builtin error.
  // TODO: (wyattjoh) replace this with just exporting the route module when the transition is complete
  const ComponentMod =
    require('./route-modules/pages/builtin/_error') as typeof import('./route-modules/pages/builtin/_error')
  const Component = ComponentMod.routeModule.userland.default

  return {
    App,
    Document,
    Component,
    pageConfig: {},
    buildManifest: (await loadManifestWithRetries(
      join(distDir, `fallback-${BUILD_MANIFEST}`)
    )) as BuildManifest,
    reactLoadableManifest: {},
    ComponentMod,
    page: '/_error',
    routeModule: ComponentMod.routeModule,
  }
}
export const loadDefaultErrorComponents = getTracer().wrap(
  LoadComponentsSpan.loadDefaultErrorComponents,
  loadDefaultErrorComponentsImpl
)
