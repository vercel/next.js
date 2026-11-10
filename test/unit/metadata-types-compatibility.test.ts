/**
 * Type compatibility tests for Metadata and ResolvedMetadata.
 *
 * These tests verify that ResolvedMetadata properties can be assigned to
 * Metadata input types. This is important because users often want to
 * extend parent metadata in generateMetadata:
 *
 * ```ts
 * export async function generateMetadata(_, parent: ResolvingMetadata) {
 *   const resolved = await parent
 *   return {
 *     openGraph: {
 *       ...resolved.openGraph,  // Should not cause type errors
 *       title: 'Override title',
 *     },
 *   }
 * }
 * ```
 *
 * If these tests fail, it means ResolvedMetadata has properties
 * that are not assignable to Metadata (e.g., `null` vs `undefined` mismatch).
 */

import type { Metadata, ResolvedMetadata } from 'next'
import { expectTypeOf } from 'expect-type'

// Extract property types for comparison
type ResolvedOpenGraphUrl = NonNullable<ResolvedMetadata['openGraph']>['url']
type MetadataOpenGraphUrl = NonNullable<Metadata['openGraph']>['url']

type ResolvedTwitterSite = NonNullable<ResolvedMetadata['twitter']>['site']
type MetadataTwitterSite = NonNullable<Metadata['twitter']>['site']

type ResolvedTwitterCreator = NonNullable<
  ResolvedMetadata['twitter']
>['creator']
type MetadataTwitterCreator = NonNullable<Metadata['twitter']>['creator']

type ResolvedTwitterSiteId = NonNullable<ResolvedMetadata['twitter']>['siteId']
type MetadataTwitterSiteId = NonNullable<Metadata['twitter']>['siteId']

type ResolvedTwitterCreatorId = NonNullable<
  ResolvedMetadata['twitter']
>['creatorId']
type MetadataTwitterCreatorId = NonNullable<Metadata['twitter']>['creatorId']

type ResolvedTwitterDescription = NonNullable<
  ResolvedMetadata['twitter']
>['description']
type MetadataTwitterDescription = NonNullable<
  Metadata['twitter']
>['description']

type ResolvedFacebookType = NonNullable<ResolvedMetadata['facebook']>
type MetadataFacebookType = NonNullable<Metadata['facebook']>

type ResolvedPinterestType = NonNullable<ResolvedMetadata['pinterest']>
type MetadataPinterestType = NonNullable<Metadata['pinterest']>

describe('Metadata and ResolvedMetadata type compatibility', () => {
  describe('top-level ResolvedMetadata', () => {
    it('should have ResolvedMetadata assignable to Metadata', () => {
      // This tests spreading the entire resolved metadata: { ...parentMeta, title: 'Test' }
      expectTypeOf<ResolvedMetadata>().toMatchTypeOf<Metadata>()
    })
  })

  describe('openGraph property types', () => {
    it('should have ResolvedOpenGraph.url assignable to Metadata.openGraph.url', () => {
      expectTypeOf<ResolvedOpenGraphUrl>().toMatchTypeOf<MetadataOpenGraphUrl>()
    })
  })

  describe('twitter property types', () => {
    it('should have ResolvedTwitter.site assignable to Metadata.twitter.site', () => {
      expectTypeOf<ResolvedTwitterSite>().toMatchTypeOf<MetadataTwitterSite>()
    })

    it('should have ResolvedTwitter.siteId assignable to Metadata.twitter.siteId', () => {
      expectTypeOf<ResolvedTwitterSiteId>().toMatchTypeOf<MetadataTwitterSiteId>()
    })

    it('should have ResolvedTwitter.creator assignable to Metadata.twitter.creator', () => {
      expectTypeOf<ResolvedTwitterCreator>().toMatchTypeOf<MetadataTwitterCreator>()
    })

    it('should have ResolvedTwitter.creatorId assignable to Metadata.twitter.creatorId', () => {
      expectTypeOf<ResolvedTwitterCreatorId>().toMatchTypeOf<MetadataTwitterCreatorId>()
    })

    it('should have ResolvedTwitter.description assignable to Metadata.twitter.description', () => {
      expectTypeOf<ResolvedTwitterDescription>().toMatchTypeOf<MetadataTwitterDescription>()
    })
  })

  describe('facebook property types', () => {
    it('should have ResolvedFacebook assignable to Metadata.facebook', () => {
      expectTypeOf<ResolvedFacebookType>().toMatchTypeOf<MetadataFacebookType>()
    })
  })

  describe('pinterest property types', () => {
    it('should have ResolvedPinterest assignable to Metadata.pinterest', () => {
      expectTypeOf<ResolvedPinterestType>().toMatchTypeOf<MetadataPinterestType>()
    })
  })
})
