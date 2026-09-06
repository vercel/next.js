import {
  createRuntimeBodyError,
  createDynamicBodyError,
  createRuntimeBodyErrorInNavigation,
  createLinkBodyErrorInNavigation,
  createNavigationBodyErrorInNavigation,
  createDynamicBodyErrorInNavigation,
  createRuntimeMetadataError,
  createLinkMetadataError,
  createNavigationMetadataError,
  createDynamicMetadataError,
  createRuntimeViewportError,
  createLinkViewportError,
  createNavigationViewportError,
  createDynamicViewportError,
} from '../../../../server/app-render/blocking-route-messages'
import { createLinkPrefetchPartialError } from '../../../../shared/lib/instant-messages'
import {
  FIX_CARD_GROUPS,
  SYNC_IO_DOCS,
  SYNC_IO_CLIENT_DOCS,
  getCards,
  type FixCardGroup,
  type GuidanceKind,
  type GuidanceVariant,
} from './instant-guidance-data'

const GUIDANCE_VARIANTS = [
  'runtime',
  'link',
  'navigation',
  'dynamic',
] as const satisfies GuidanceVariant[]

function tagsFromMessage(message: string): string[] {
  return Array.from(message.matchAll(/^\s*-\s*\[([a-z]+)\]/gm)).map((m) => m[1])
}

function groupsFromCards(
  kind: GuidanceKind,
  variant: GuidanceVariant
): string[] {
  return getCards(kind, variant).map((card) => card.group)
}

describe('instant-guidance-data card ordering', () => {
  it.each([
    [
      'blocking-route runtime',
      createRuntimeBodyError('/x').message,
      'blocking-route',
      'runtime',
    ],
    [
      'blocking-route dynamic',
      createDynamicBodyError('/x').message,
      'blocking-route',
      'dynamic',
    ],

    [
      'blocking-route runtime in navigation',
      createRuntimeBodyErrorInNavigation('/x').message,
      'blocking-route',
      'runtime',
    ],
    [
      'blocking-route link in navigation',
      createLinkBodyErrorInNavigation('/x').message,
      'blocking-route',
      'link',
    ],
    [
      'blocking-route navigation in navigation',
      createNavigationBodyErrorInNavigation('/x').message,
      'blocking-route',
      'navigation',
    ],
    [
      'blocking-route dynamic in navigation',
      createDynamicBodyErrorInNavigation('/x').message,
      'blocking-route',
      'dynamic',
    ],

    [
      'metadata runtime',
      createRuntimeMetadataError('/x').message,
      'metadata',
      'runtime',
    ],
    [
      'metadata link',
      createLinkMetadataError('/x').message,
      'metadata',
      'link',
    ],
    [
      'metadata navigation',
      createNavigationMetadataError('/x').message,
      'metadata',
      'navigation',
    ],
    [
      'metadata dynamic',
      createDynamicMetadataError('/x').message,
      'metadata',
      'dynamic',
    ],

    [
      'viewport runtime',
      createRuntimeViewportError('/x').message,
      'viewport',
      'runtime',
    ],
    [
      'viewport link',
      createLinkViewportError('/x').message,
      'viewport',
      'link',
    ],
    [
      'viewport navigation',
      createNavigationViewportError('/x').message,
      'viewport',
      'navigation',
    ],
    [
      'viewport dynamic',
      createDynamicViewportError('/x').message,
      'viewport',
      'dynamic',
    ],

    [
      'link-prefetch-partial',
      createLinkPrefetchPartialError('/x').message,
      'link-prefetch-partial',
      'runtime',
    ],
  ] as const)(
    'console tags and overlay card groups agree for %s',
    (_name, message, kind, variant) => {
      expect(tagsFromMessage(message)).toEqual(groupsFromCards(kind, variant))
    }
  )
})

describe('instant-guidance-data card links', () => {
  it('every card.link ends with #card.id', () => {
    type Item = [GuidanceKind, GuidanceVariant]
    const variants: Array<Item> = [
      ...GUIDANCE_VARIANTS.map((v) => ['blocking-route', v] as Item),
      ...GUIDANCE_VARIANTS.map((v) => ['metadata', v] as Item),
      ...GUIDANCE_VARIANTS.map((v) => ['viewport', v] as Item),
      ['client-hook', 'runtime'],
      ['unrendered-segment', 'runtime'],
      ['link-prefetch-partial', 'runtime'],
    ]
    for (const [kind, variant] of variants) {
      for (const card of getCards(kind, variant)) {
        if (card.link === null) continue
        expect(card.link).toMatch(new RegExp(`#${card.id}$`))
      }
    }
  })
})

describe('instant-guidance-data card invariants', () => {
  function allCards() {
    const cards = []
    type Item = [GuidanceKind, GuidanceVariant, string?]
    const variants: Array<Item> = [
      ...GUIDANCE_VARIANTS.map((v) => ['blocking-route', v] as Item),
      ['blocking-route', 'dynamic', 'connection'],

      ...GUIDANCE_VARIANTS.map((v) => ['metadata', v] as Item),
      ['metadata', 'dynamic', 'connection'],

      ...GUIDANCE_VARIANTS.map((v) => ['viewport', v] as Item),
      ['viewport', 'dynamic', 'connection'],

      ['client-hook', 'runtime'],
      ['unrendered-segment', 'runtime'],
      ['link-prefetch-partial', 'runtime'],
    ]
    for (const [kind, variant, cause] of variants) {
      cards.push(...getCards(kind, variant, cause))
    }
    for (const cause of Object.keys(SYNC_IO_DOCS)) {
      cards.push(...getCards('sync-io', 'runtime', cause))
    }
    for (const cause of Object.keys(SYNC_IO_CLIENT_DOCS)) {
      cards.push(...getCards('sync-io-client', 'runtime', cause))
    }
    return cards
  }

  it('every card group is registered in FIX_CARD_GROUPS', () => {
    for (const card of allCards()) {
      expect(FIX_CARD_GROUPS).toHaveProperty(card.group)
    }
  })

  it('every card has a non-empty title and at least one snippet', () => {
    for (const card of allCards()) {
      expect(card.title).not.toBe('')
      expect(card.snippets.length).toBeGreaterThan(0)
    }
  })

  it('every link is either null or a docs URL', () => {
    for (const card of allCards()) {
      if (card.link === null) continue
      expect(card.link).toMatch(/^https:\/\/nextjs\.org\/docs\/messages\//)
    }
  })
})

describe('instant-guidance-data dispatcher', () => {
  it('filterCacheForConnection removes the cache card for connection() cause', () => {
    const withoutCause = getCards('blocking-route', 'dynamic')
    const withConnection = getCards('blocking-route', 'dynamic', 'connection')
    expect(withoutCause.map((c) => c.group)).toContain('cache')
    expect(withConnection.map((c) => c.group)).not.toContain('cache')
  })

  it('returns non-empty cards for every documented sync-io cause', () => {
    for (const cause of Object.keys(SYNC_IO_DOCS)) {
      expect(getCards('sync-io', 'runtime', cause).length).toBeGreaterThan(0)
    }
    for (const cause of Object.keys(SYNC_IO_CLIENT_DOCS)) {
      expect(
        getCards('sync-io-client', 'runtime', cause).length
      ).toBeGreaterThan(0)
    }
  })

  it('every group in FIX_CARD_GROUPS is used by at least one card', () => {
    const used = new Set<FixCardGroup>()
    type Item = [GuidanceKind, GuidanceVariant]
    const variants: Array<Item> = [
      ...GUIDANCE_VARIANTS.map((v) => ['blocking-route', v] as Item),
      ...GUIDANCE_VARIANTS.map((v) => ['metadata', v] as Item),
      ...GUIDANCE_VARIANTS.map((v) => ['viewport', v] as Item),
      ['client-hook', 'runtime'],
      ['unrendered-segment', 'runtime'],
      ['link-prefetch-partial', 'runtime'],
    ]
    for (const [kind, variant] of variants) {
      for (const card of getCards(kind, variant)) used.add(card.group)
    }
    for (const cause of Object.keys(SYNC_IO_DOCS)) {
      for (const card of getCards('sync-io', 'runtime', cause))
        used.add(card.group)
    }
    for (const cause of Object.keys(SYNC_IO_CLIENT_DOCS)) {
      for (const card of getCards('sync-io-client', 'runtime', cause))
        used.add(card.group)
    }
    for (const group of Object.keys(FIX_CARD_GROUPS) as FixCardGroup[]) {
      expect(used).toContain(group)
    }
  })
})
