import { nextTestSetup } from 'e2e-utils'
import type { NextAdapter } from 'next'

// Contract tests for the allowQuery emitted for BLOCKING prerender entries
// (entries with no servable fallback). The fixture app has TWO root layouts:
//
// - `(standard)/` hosts routes below the root layout — no root params.
// - `with-root-param/[lang]/` hosts the root layout INSIDE [lang], making
//   `lang` a ROOT param. Root params must be provided by every
//   generateStaticParams result (the build enforces this), so `lang` is
//   always prerenderable.
//
// The cache-key contract: a param may participate in allowQuery only if
// generateStaticParams can still complete it — root params (always covered)
// and partially-covered params qualify; params never returned by
// generateStaticParams do not. This applies to blocking entries the same as
// to fallback-backed entries: including a never-prerenderable param creates
// a cache entry per value and resolves the param into cached content.
//
// These assertions describe the desired output and are expected to fail
// until the adapter implements the key filtering for blocking entries (both
// the empty-shell downgrade case and the unresolved-root-param case).
describe('adapter-partial-fallback-blocking', () => {
  const { next } = nextTestSetup({
    files: __dirname,
  })

  it('should exclude never-prerenderable params from allowQuery for blocking routes with empty shells', async () => {
    const { outputs }: Parameters<NextAdapter['onBuildComplete']>[0] =
      await next.readJSON('build-complete.json')

    const genericEmptyShellPrerender = outputs.prerenders.find(
      (output) => output.pathname === '/empty-shell/[one]/[two]'
    )
    const genericEmptyShellDataPrerender = outputs.prerenders.find(
      (output) => output.pathname === '/empty-shell/[one]/[two].rsc'
    )
    const genericEmptyShellSegmentPrerenders = outputs.prerenders.filter(
      (output) =>
        output.pathname.startsWith('/empty-shell/[one]/[two].segments/')
    )
    const generatedEmptyShellPrerender = outputs.prerenders.find(
      (output) => output.pathname === '/empty-shell/a/[two]'
    )

    expect(genericEmptyShellPrerender).toBeDefined()
    expect(genericEmptyShellDataPrerender).toBeDefined()
    expect(genericEmptyShellSegmentPrerenders.length).toBeGreaterThan(0)
    expect(generatedEmptyShellPrerender).toBeDefined()

    // The generic route's empty build-time shell downgraded it to a blocking
    // route (no servable fallback), but `two` is still never provided by
    // generateStaticParams: an on-demand render must only complete `one`, so
    // only `one` may be part of the cache key. Including `two` would create
    // a cache entry per `two` value and resolve `two` into cached content.
    expect(genericEmptyShellPrerender.config.allowQuery).toEqual(['nxtPone'])
    expect(genericEmptyShellDataPrerender.config.allowQuery).toEqual([
      'nxtPone',
    ])
    for (const output of genericEmptyShellSegmentPrerenders) {
      expect(output.config.allowQuery).toEqual(['nxtPone'])
    }

    // The generated route is already the most specific prerenderable shell
    // (only the never-prerenderable `two` remains), so it stays a single
    // shared entry.
    expect(generatedEmptyShellPrerender.config.partialFallback).toBeUndefined()
    expect(generatedEmptyShellPrerender.config.allowQuery).toEqual([])
  })

  it('should exclude never-prerenderable params from allowQuery for entries with a resolved root param', async () => {
    const { outputs }: Parameters<NextAdapter['onBuildComplete']>[0] =
      await next.readJSON('build-complete.json')

    const emptyShellPrerender = outputs.prerenders.find(
      (output) =>
        output.pathname === '/with-root-param/en/empty-shell/[category]/[id]'
    )
    const emptyShellDataPrerender = outputs.prerenders.find(
      (output) =>
        output.pathname ===
        '/with-root-param/en/empty-shell/[category]/[id].rsc'
    )
    const nonEmptyShellPrerender = outputs.prerenders.find(
      (output) =>
        output.pathname ===
        '/with-root-param/en/non-empty-shell/[category]/[id]'
    )
    const emptyShellLeafPrerender = outputs.prerenders.find(
      (output) =>
        output.pathname === '/with-root-param/en/empty-shell/shoes/[id]'
    )

    expect(emptyShellPrerender).toBeDefined()
    expect(emptyShellDataPrerender).toBeDefined()
    expect(nonEmptyShellPrerender).toBeDefined()
    expect(emptyShellLeafPrerender).toBeDefined()

    // With `lang` resolved at build time these entries behave exactly like
    // the (standard) branch: the blocking (empty shell) entry must only key
    // on `category`.
    expect(emptyShellPrerender.config.allowQuery).toEqual(['nxtPcategory'])
    expect(emptyShellDataPrerender.config.allowQuery).toEqual(['nxtPcategory'])

    // The non-empty intermediate already works (regression guard).
    expect(nonEmptyShellPrerender.config.allowQuery).toEqual(['nxtPcategory'])
    expect(nonEmptyShellPrerender.config.partialFallback).toBe(true)

    // The terminal shell stays a single shared entry.
    expect(emptyShellLeafPrerender.config.allowQuery).toEqual([])
  })

  it('should exclude never-prerenderable params from allowQuery for entries with an unresolved root param', async () => {
    const { outputs }: Parameters<NextAdapter['onBuildComplete']>[0] =
      await next.readJSON('build-complete.json')

    const emptyShellBasePrerender = outputs.prerenders.find(
      (output) =>
        output.pathname ===
        '/with-root-param/[lang]/empty-shell/[category]/[id]'
    )
    const emptyShellBaseDataPrerender = outputs.prerenders.find(
      (output) =>
        output.pathname ===
        '/with-root-param/[lang]/empty-shell/[category]/[id].rsc'
    )
    const nonEmptyShellBasePrerender = outputs.prerenders.find(
      (output) =>
        output.pathname ===
        '/with-root-param/[lang]/non-empty-shell/[category]/[id]'
    )

    expect(emptyShellBasePrerender).toBeDefined()
    expect(emptyShellBaseDataPrerender).toBeDefined()
    expect(nonEmptyShellBasePrerender).toBeDefined()

    // An unresolved root param forces a blocking route, but that must not
    // put `id` into the cache key: `lang` (root, always prerenderable) and
    // `category` (prerenderable) form the key; `id` stays deferred.
    expect(emptyShellBasePrerender.config.allowQuery).toEqual([
      'nxtPlang',
      'nxtPcategory',
    ])
    expect(emptyShellBaseDataPrerender.config.allowQuery).toEqual([
      'nxtPlang',
      'nxtPcategory',
    ])
    expect(nonEmptyShellBasePrerender.config.allowQuery).toEqual([
      'nxtPlang',
      'nxtPcategory',
    ])
  })
})
