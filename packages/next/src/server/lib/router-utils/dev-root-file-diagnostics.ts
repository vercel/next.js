import path from 'path'
import { stat } from 'fs/promises'
import * as Log from '../../../build/output/log'
import type { NextConfigComplete } from '../../config-shared'
import { PAGE_TYPES } from '../../../lib/page-types'
import { MIDDLEWARE_FILENAME, PROXY_FILENAME } from '../../../lib/constants'

type MiddlewareCandidate = Readonly<{
  filePath: string
  page: string
  convention: typeof MIDDLEWARE_FILENAME | typeof PROXY_FILENAME
}>

/** A fixed candidate list, in the same order as native middleware_files. */
export function createMiddlewareCandidates(
  dir: string,
  pageExtensions: readonly string[]
): readonly MiddlewareCandidate[] {
  const conventions = [
    { convention: MIDDLEWARE_FILENAME, folder: dir, prefix: '' },
    {
      convention: MIDDLEWARE_FILENAME,
      folder: path.join(dir, 'src'),
      prefix: '/src',
    },
    { convention: PROXY_FILENAME, folder: dir, prefix: '' },
    {
      convention: PROXY_FILENAME,
      folder: path.join(dir, 'src'),
      prefix: '/src',
    },
  ] as const
  return conventions.flatMap(({ convention, folder, prefix }) =>
    pageExtensions.map((extension) => ({
      filePath: path.join(folder, `${convention}.${extension}`),
      page: `${prefix}/${convention}`,
      convention,
    }))
  )
}

async function existingMiddlewareCandidates(
  candidates: readonly MiddlewareCandidate[]
): Promise<readonly MiddlewareCandidate[]> {
  const existing = await Promise.all(
    candidates.map(async (candidate) => {
      try {
        return (await stat(candidate.filePath)).isFile() ? candidate : undefined
      } catch (error: any) {
        if (error.code === 'ENOENT' || error.code === 'ENOTDIR')
          return undefined
        throw error
      }
    })
  )
  return existing.filter(
    (candidate): candidate is MiddlewareCandidate => candidate !== undefined
  )
}

/** Preserve root-file diagnostics without independently discovering routes. */
export async function reportMiddlewareDiagnostics(
  candidates: readonly MiddlewareCandidate[],
  nextConfig: NextConfigComplete
): Promise<void> {
  const existing = await existingMiddlewareCandidates(candidates)
  const middleware = existing.find(
    (candidate) => candidate.convention === MIDDLEWARE_FILENAME
  )
  const proxy = existing.find(
    (candidate) => candidate.convention === PROXY_FILENAME
  )
  if (middleware && proxy) {
    const cwd = process.cwd()
    throw new Error(
      `Both ${MIDDLEWARE_FILENAME} file "./${path.relative(cwd, middleware.filePath)}" and ${PROXY_FILENAME} file "./${path.relative(cwd, proxy.filePath)}" are detected. Please use "./${path.relative(cwd, proxy.filePath)}" only. Learn more: https://nextjs.org/docs/messages/middleware-to-proxy`
    )
  }
  if (middleware) {
    Log.warnOnce(
      `The "${MIDDLEWARE_FILENAME}" file convention is deprecated. Please use "${PROXY_FILENAME}" instead.\n\n` +
        `  To migrate automatically, run:\n` +
        `  npx @next/codemod@canary middleware-to-proxy .\n\n` +
        `  Learn more: https://nextjs.org/docs/messages/middleware-to-proxy`
    )
  }
  if (existing.length === 0) return
  const { getPagesPageStaticInfo } =
    require('../../../build/analysis/get-page-static-info') as typeof import('../../../build/analysis/get-page-static-info')
  for (const candidate of existing) {
    // These root files have no App layout inheritance. Discard the parsed
    // matcher/runtime: the native inventory remains authoritative for routing.
    await getPagesPageStaticInfo({
      pageFilePath: candidate.filePath,
      page: candidate.page,
      nextConfig,
      isDev: true,
      pageType: PAGE_TYPES.PAGES,
    })
  }
}
