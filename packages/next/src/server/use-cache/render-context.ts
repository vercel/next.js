import type { WorkUnitStore } from '../app-render/work-unit-async-storage.external'

export interface UseCacheRenderContextPrerender {
  readonly type: 'prerender'
  readonly renderSignal: AbortSignal
  readonly dynamicAccessAbortController: AbortController
  readonly allowEmptyStaticShell: boolean
}

export interface UseCacheRenderContextPrerenderPPR {
  readonly type: 'prerender-ppr'
}

export interface UseCacheRenderContextPrerenderLegacy {
  readonly type: 'prerender-legacy'
}

export interface UseCacheRenderContextRequest {
  readonly type: 'request'
}

export type UseCacheRenderContext =
  | UseCacheRenderContextPrerender
  | UseCacheRenderContextPrerenderPPR
  | UseCacheRenderContextPrerenderLegacy
  | UseCacheRenderContextRequest

export function createUseCacheRenderContext(
  workUnitStore: WorkUnitStore
): UseCacheRenderContext | undefined {
  switch (workUnitStore.type) {
    case 'prerender':
      return {
        type: 'prerender',
        renderSignal: workUnitStore.renderSignal,
        dynamicAccessAbortController: new AbortController(),
        allowEmptyStaticShell: workUnitStore.allowEmptyStaticShell,
      }
    case 'prerender-ppr':
    case 'prerender-legacy':
    case 'request':
      return { type: workUnitStore.type }
    case 'cache':
      if (workUnitStore.renderContext?.type === 'prerender') {
        return {
          ...workUnitStore.renderContext,
          // Each cache scope gets its own abort controller.
          dynamicAccessAbortController: new AbortController(),
        }
      }

      return workUnitStore.renderContext
    default:
      return undefined
  }
}
