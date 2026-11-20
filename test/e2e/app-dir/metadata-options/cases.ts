import type { Metadata, Viewport } from 'next'

export type Expected = {
  title?: string
  names?: Record<string, string | string[] | null>
  properties?: Record<string, string | string[] | null>
  links?: { selector: string; attributes: Record<string, string> }[]
}

export type MetadataCase = {
  name: string
  metadata?: Metadata
  viewport?: Viewport
  expected: Expected
}

export const basicMetadata: Metadata = {
  metadataBase: 'https://example.com',
  title: 'Reference title',
  description: 'Reference description',
  applicationName: 'Metadata Options',
  authors: [
    { name: 'Ada' },
    { name: 'Grace', url: new URL('https://example.com/grace') },
  ],
  generator: 'Next.js',
  keywords: ['Next.js', 'React'],
  referrer: 'strict-origin',
  creator: 'Ada',
  publisher: 'Example',
  manifest: new URL('https://example.com/manifest.webmanifest'),
  abstract: 'Reference abstract',
  classification: 'Education',
  category: 'Technology',
  archives: ['https://example.com/archive-a', 'https://example.com/archive-b'],
  assets: 'https://example.com/assets',
  bookmarks: ['https://example.com/bookmark'],
  pagination: { previous: '/previous', next: '/next' },
  formatDetection: {
    telephone: false,
    date: false,
    address: false,
    email: false,
    url: false,
  },
  verification: {
    google: ['google-token', 123],
    yahoo: 456,
    yandex: 'yandex-token',
    me: ['email@example.com', 'https://example.com/me'],
    other: { 'custom-verification': ['custom-token', 789] },
  },
  appleWebApp: {
    capable: true,
    title: 'Example App',
    startupImage: [
      '/startup.png',
      { url: '/startup-wide.png', media: '(min-width: 768px)' },
    ],
    statusBarStyle: 'black-translucent',
  },
  itunes: { appId: '123456789', appArgument: 'https://example.com/app' },
  facebook: { appId: '123456', admins: ['111', '222'] },
  pinterest: { richPin: false },
  icons: {
    icon: {
      url: '/mask.svg',
      type: 'image/svg+xml',
      sizes: 'any',
      color: '#000000',
      rel: 'mask-icon',
      media: '(prefers-color-scheme: dark)',
      fetchPriority: 'high',
    },
    shortcut: '/shortcut.ico',
    apple: '/apple.png',
    other: { url: '/other.png', rel: 'apple-touch-icon-precomposed' },
  },
  other: {
    'custom-string': 'value',
    'custom-number': 42,
    'custom-array': ['one', 'two'],
  },
}

export const completeViewport: Viewport = {
  width: 'device-width',
  height: 'device-height',
  initialScale: 1,
  minimumScale: 0.5,
  maximumScale: 3,
  userScalable: true,
  viewportFit: 'cover',
  interactiveWidget: 'overlays-content',
  themeColor: [
    { color: 'white', media: '(prefers-color-scheme: light)' },
    { color: 'black', media: '(prefers-color-scheme: dark)' },
  ],
  colorScheme: 'light dark',
}

export const completeViewportExpected: Expected = {
  names: {
    viewport:
      'width=device-width, height=device-height, initial-scale=1, minimum-scale=0.5, maximum-scale=3, user-scalable=yes, viewport-fit=cover, interactive-widget=overlays-content',
    'theme-color': ['white', 'black'],
    'color-scheme': 'light dark',
  },
}

export const cases: MetadataCase[] = [
  {
    name: 'basic',
    metadata: basicMetadata,
    expected: {
      title: 'Reference title',
      names: {
        description: 'Reference description',
        'application-name': 'Metadata Options',
        author: ['Ada', 'Grace'],
        generator: 'Next.js',
        keywords: 'Next.js,React',
        referrer: 'strict-origin',
        creator: 'Ada',
        publisher: 'Example',
        abstract: 'Reference abstract',
        classification: 'Education',
        category: 'Technology',
        'format-detection':
          'telephone=no, date=no, address=no, email=no, url=no',
        'google-site-verification': ['google-token', '123'],
        y_key: '456',
        'yandex-verification': 'yandex-token',
        me: ['email@example.com', 'https://example.com/me'],
        'custom-verification': ['custom-token', '789'],
        'mobile-web-app-capable': 'yes',
        'apple-mobile-web-app-title': 'Example App',
        'apple-mobile-web-app-status-bar-style': 'black-translucent',
        'apple-itunes-app':
          'app-id=123456789, app-argument=https://example.com/app',
        'custom-string': 'value',
        'custom-number': '42',
        'custom-array': ['one', 'two'],
      },
      properties: {
        'fb:app_id': '123456',
        'fb:admins': ['111', '222'],
        'pinterest-rich-pin': 'false',
      },
      links: [
        {
          selector: 'link[rel="author"]',
          attributes: { href: 'https://example.com/grace' },
        },
        {
          selector: 'link[rel="manifest"]',
          attributes: { href: 'https://example.com/manifest.webmanifest' },
        },
        ...['archive-a', 'archive-b'].map((name) => ({
          selector: `link[rel="archives"][href="https://example.com/${name}"]`,
          attributes: { href: `https://example.com/${name}` },
        })),
        {
          selector: 'link[rel="assets"]',
          attributes: { href: 'https://example.com/assets' },
        },
        {
          selector: 'link[rel="bookmarks"]',
          attributes: { href: 'https://example.com/bookmark' },
        },
        {
          selector: 'link[rel="prev"]',
          attributes: { href: 'https://example.com/previous' },
        },
        {
          selector: 'link[rel="next"]',
          attributes: { href: 'https://example.com/next' },
        },
        {
          selector:
            'link[rel="apple-touch-startup-image"][href="/startup.png"]',
          attributes: { href: '/startup.png' },
        },
        {
          selector:
            'link[rel="apple-touch-startup-image"][href="/startup-wide.png"]',
          attributes: { media: '(min-width: 768px)' },
        },
        {
          selector: 'link[rel="mask-icon"]',
          attributes: {
            href: '/mask.svg',
            type: 'image/svg+xml',
            sizes: 'any',
            color: '#000000',
            media: '(prefers-color-scheme: dark)',
            fetchpriority: 'high',
          },
        },
        {
          selector: 'link[rel="shortcut icon"]',
          attributes: { href: '/shortcut.ico' },
        },
        {
          selector: 'link[rel="apple-touch-icon"]',
          attributes: { href: '/apple.png' },
        },
        {
          selector: 'link[rel="apple-touch-icon-precomposed"]',
          attributes: { href: '/other.png' },
        },
      ],
    },
  },
  {
    name: 'viewport-complete',
    viewport: completeViewport,
    expected: completeViewportExpected,
  },
  {
    name: 'deprecated-viewport-metadata',
    metadata: {
      themeColor: 'red',
      colorScheme: 'dark',
      viewport: { width: 800, initialScale: 2 },
    },
    expected: { names: { 'theme-color': null, 'color-scheme': null } },
  },
  {
    name: 'scalar-fields',
    metadata: {
      authors: { name: 'Author', url: 'https://example.com/author' },
      keywords: 'one keyword',
      archives: '/archive',
      assets: ['/asset-a', '/asset-b'],
      bookmarks: '/bookmark',
      facebook: { admins: '111' },
      pinterest: { richPin: 'true' },
    },
    expected: {
      names: { author: 'Author', keywords: 'one keyword' },
      properties: { 'fb:admins': '111', 'pinterest-rich-pin': 'true' },
      links: [
        {
          selector: 'link[rel="author"]',
          attributes: { href: 'https://example.com/author' },
        },
        { selector: 'link[rel="archives"]', attributes: { href: '/archive' } },
        {
          selector: 'link[rel="assets"][href="/asset-a"]',
          attributes: { href: '/asset-a' },
        },
        {
          selector: 'link[rel="assets"][href="/asset-b"]',
          attributes: { href: '/asset-b' },
        },
        {
          selector: 'link[rel="bookmarks"]',
          attributes: { href: '/bookmark' },
        },
      ],
    },
  },
  {
    name: 'title-default',
    metadata: { title: { default: 'Default title', template: '%s | Site' } },
    expected: { title: 'Default title' },
  },
  {
    name: 'title-absolute',
    metadata: { title: { absolute: 'Absolute title' } },
    expected: { title: 'Absolute title' },
  },
  {
    name: 'format-detection-enabled',
    metadata: {
      formatDetection: {
        telephone: true,
        date: true,
        address: true,
        email: true,
        url: true,
      },
    },
    expected: { names: { 'format-detection': null } },
  },
  {
    name: 'apple-enabled',
    metadata: { appleWebApp: true },
    expected: {
      names: {
        'mobile-web-app-capable': 'yes',
        'apple-mobile-web-app-status-bar-style': null,
      },
    },
  },
  {
    name: 'apple-disabled',
    metadata: { appleWebApp: false },
    expected: {
      names: {
        'mobile-web-app-capable': null,
        'apple-mobile-web-app-title': null,
      },
    },
  },
  {
    name: 'apple-not-capable',
    metadata: { appleWebApp: { capable: false, title: 'Title' } },
    expected: {
      names: {
        'mobile-web-app-capable': null,
        'apple-mobile-web-app-title': 'Title',
        'apple-mobile-web-app-status-bar-style': 'default',
      },
    },
  },
  {
    name: 'itunes-id-only',
    metadata: { itunes: { appId: '123456789' } },
    expected: { names: { 'apple-itunes-app': 'app-id=123456789' } },
  },
  {
    name: 'icons-string',
    metadata: { icons: '/icon.png' },
    expected: {
      links: [
        { selector: 'link[rel="icon"]', attributes: { href: '/icon.png' } },
      ],
    },
  },
  {
    name: 'icons-url',
    metadata: { icons: new URL('https://example.com/icon.png') },
    expected: {
      links: [
        {
          selector: 'link[rel="icon"]',
          attributes: { href: 'https://example.com/icon.png' },
        },
      ],
    },
  },
  {
    name: 'icons-array',
    metadata: { icons: ['/first.png', { url: '/second.png', sizes: '32x32' }] },
    expected: {
      links: [
        {
          selector: 'link[rel="icon"][href="/first.png"]',
          attributes: { href: '/first.png' },
        },
        {
          selector: 'link[rel="icon"][href="/second.png"]',
          attributes: { sizes: '32x32' },
        },
      ],
    },
  },
  {
    name: 'robots-object',
    metadata: {
      robots: {
        index: false,
        follow: false,
        noarchive: true,
        nosnippet: true,
        noimageindex: true,
        nocache: true,
        notranslate: true,
        indexifembedded: true,
        nositelinkssearchbox: true,
        unavailable_after: '25 Jun 2027 15:00:00 PST',
        'max-video-preview': 10,
        'max-image-preview': 'large',
        'max-snippet': 20,
        googleBot: {
          index: true,
          follow: true,
          'max-video-preview': '5',
          'max-image-preview': 'standard',
          'max-snippet': -1,
        },
      },
    },
    expected: {
      names: {
        robots:
          'noindex, nofollow, noarchive, nosnippet, noimageindex, nocache, notranslate, indexifembedded, nositelinkssearchbox, unavailable_after:25 Jun 2027 15:00:00 PST, max-video-preview:10, max-image-preview:large, max-snippet:20',
        googlebot:
          'index, follow, max-video-preview:5, max-image-preview:standard, max-snippet:-1',
      },
    },
  },
  {
    name: 'robots-string',
    metadata: { robots: 'noindex, nofollow' },
    expected: { names: { robots: 'noindex, nofollow', googlebot: null } },
  },
  {
    name: 'googlebot-string',
    metadata: {
      robots: { googleBot: 'noindex, follow', 'max-image-preview': 'none' },
    },
    expected: {
      names: { robots: 'max-image-preview:none', googlebot: 'noindex, follow' },
    },
  },
  {
    name: 'alternates',
    metadata: {
      alternates: {
        canonical: { url: '/canonical', title: 'Canonical title' },
        languages: {
          'en-US': [
            { url: '/english-a', title: 'English A' },
            { url: '/english-b', title: 'English B' },
          ],
          'x-default': '/',
        },
        media: { '(max-width: 600px)': [{ url: '/mobile', title: 'Mobile' }] },
        types: { 'application/rss+xml': [{ url: '/feed', title: 'RSS feed' }] },
      },
    },
    expected: {
      links: [
        {
          selector: 'link[rel="canonical"]',
          attributes: {
            href: 'https://example.com/canonical',
            title: 'Canonical title',
          },
        },
        {
          selector: 'link[hreflang="en-US"][title="English A"]',
          attributes: { href: 'https://example.com/english-a' },
        },
        {
          selector: 'link[hreflang="en-US"][title="English B"]',
          attributes: { href: 'https://example.com/english-b' },
        },
        {
          selector: 'link[hreflang="x-default"]',
          attributes: { href: 'https://example.com' },
        },
        {
          selector: 'link[media="(max-width: 600px)"]',
          attributes: { href: 'https://example.com/mobile', title: 'Mobile' },
        },
        {
          selector: 'link[type="application/rss+xml"]',
          attributes: { href: 'https://example.com/feed', title: 'RSS feed' },
        },
      ],
    },
  },
  {
    name: 'app-links',
    metadata: {
      appLinks: {
        ios: {
          url: new URL('https://example.com/ios'),
          app_store_id: 123,
          app_name: 'iOS App',
        },
        iphone: [
          {
            url: 'https://example.com/iphone',
            app_store_id: '456',
            app_name: 'iPhone App',
          },
        ],
        ipad: {
          url: 'https://example.com/ipad',
          app_store_id: '789',
          app_name: 'iPad App',
        },
        android: {
          package: 'com.example.app',
          url: 'https://example.com/android',
          class: 'com.example.Main',
          app_name: 'Android App',
        },
        windows_phone: {
          url: 'https://example.com/phone',
          app_id: 'phone-id',
          app_name: 'Phone App',
        },
        windows: {
          url: 'https://example.com/windows',
          app_id: 'windows-id',
          app_name: 'Windows App',
        },
        windows_universal: {
          url: 'https://example.com/universal',
          app_id: 'universal-id',
          app_name: 'Universal App',
        },
        web: { url: 'https://example.com/web', should_fallback: false },
      },
    },
    expected: {
      properties: {
        'al:ios:url': 'https://example.com/ios',
        'al:ios:app_store_id': '123',
        'al:ios:app_name': 'iOS App',
        'al:iphone:url': 'https://example.com/iphone',
        'al:iphone:app_store_id': '456',
        'al:iphone:app_name': 'iPhone App',
        'al:ipad:url': 'https://example.com/ipad',
        'al:ipad:app_store_id': '789',
        'al:ipad:app_name': 'iPad App',
        'al:android:package': 'com.example.app',
        'al:android:url': 'https://example.com/android',
        'al:android:class': 'com.example.Main',
        'al:android:app_name': 'Android App',
        'al:windows_phone:url': 'https://example.com/phone',
        'al:windows_phone:app_id': 'phone-id',
        'al:windows_phone:app_name': 'Phone App',
        'al:windows:url': 'https://example.com/windows',
        'al:windows:app_id': 'windows-id',
        'al:windows:app_name': 'Windows App',
        'al:windows_universal:url': 'https://example.com/universal',
        'al:windows_universal:app_id': 'universal-id',
        'al:windows_universal:app_name': 'Universal App',
        'al:web:url': 'https://example.com/web',
        'al:web:should_fallback': 'false',
      },
    },
  },
]

function addOpenGraph(
  name: string,
  openGraph: NonNullable<Metadata['openGraph']>,
  properties: NonNullable<Expected['properties']>
) {
  cases.push({ name, metadata: { openGraph }, expected: { properties } })
}

addOpenGraph(
  'og-common',
  {
    type: 'website',
    title: { absolute: 'Open Graph title' },
    description: 'Open Graph description',
    url: '/article',
    siteName: 'Example Site',
    locale: 'en_US',
    alternateLocale: ['nb_NO', 'fr_FR'],
    determiner: 'the',
    emails: 'hello@example.com',
    phoneNumbers: ['111', '222'],
    faxNumbers: '333',
    countryName: 'Norway',
    ttl: 60,
    images: [
      {
        url: '/image.png',
        secureUrl: 'https://example.com/secure.png',
        type: 'image/png',
        width: 800,
        height: 600,
        alt: 'An image',
      },
      new URL('https://example.com/second.png'),
    ],
    audio: [
      {
        url: 'https://example.com/audio.mp3',
        secureUrl: 'https://example.com/secure.mp3',
        type: 'audio/mpeg',
      },
      new URL('https://example.com/second.mp3'),
    ],
    videos: [
      {
        url: 'https://example.com/video.mp4',
        secureUrl: 'https://example.com/secure.mp4',
        type: 'video/mp4',
        width: '1280',
        height: '720',
      },
      new URL('https://example.com/second.mp4'),
    ],
  },
  {
    'og:type': 'website',
    'og:title': 'Open Graph title',
    'og:description': 'Open Graph description',
    'og:url': 'https://example.com/article',
    'og:site_name': 'Example Site',
    'og:locale': 'en_US',
    'og:locale:alternate': ['nb_NO', 'fr_FR'],
    'og:determiner': 'the',
    'og:email': 'hello@example.com',
    'og:phone_number': ['111', '222'],
    'og:fax_number': '333',
    'og:country_name': 'Norway',
    'og:ttl': '60',
    'og:image': [
      'https://example.com/image.png',
      'https://example.com/second.png',
    ],
    'og:image:secure_url': 'https://example.com/secure.png',
    'og:image:type': 'image/png',
    'og:image:width': '800',
    'og:image:height': '600',
    'og:image:alt': 'An image',
    'og:audio': [
      'https://example.com/audio.mp3',
      'https://example.com/second.mp3',
    ],
    'og:audio:secure_url': 'https://example.com/secure.mp3',
    'og:audio:type': 'audio/mpeg',
    'og:video': [
      'https://example.com/video.mp4',
      'https://example.com/second.mp4',
    ],
    'og:video:secure_url': 'https://example.com/secure.mp4',
    'og:video:type': 'video/mp4',
    'og:video:width': '1280',
    'og:video:height': '720',
  }
)
addOpenGraph(
  'og-article',
  {
    type: 'article',
    publishedTime: '2026-01-01T00:00:00Z',
    modifiedTime: '2026-02-01T00:00:00Z',
    expirationTime: '2027-01-01T00:00:00Z',
    authors: ['https://example.com/ada', new URL('https://example.com/grace')],
    section: 'Technology',
    tags: ['Next.js', 'React'],
  },
  {
    'og:type': 'article',
    'article:published_time': '2026-01-01T00:00:00Z',
    'article:modified_time': '2026-02-01T00:00:00Z',
    'article:expiration_time': '2027-01-01T00:00:00Z',
    'article:author': ['https://example.com/ada', 'https://example.com/grace'],
    'article:section': 'Technology',
    'article:tag': ['Next.js', 'React'],
  }
)
addOpenGraph(
  'og-book',
  {
    type: 'book',
    isbn: '9780000000001',
    releaseDate: '2026-01-01',
    authors: 'https://example.com/author',
    tags: 'Fiction',
  },
  {
    'og:type': 'book',
    'book:isbn': '9780000000001',
    'book:release_date': '2026-01-01',
    'book:author': 'https://example.com/author',
    'book:tag': 'Fiction',
  }
)
addOpenGraph(
  'og-profile',
  {
    type: 'profile',
    firstName: 'Ada',
    lastName: 'Lovelace',
    username: 'ada',
    gender: 'female',
  },
  {
    'og:type': 'profile',
    'profile:first_name': 'Ada',
    'profile:last_name': 'Lovelace',
    'profile:username': 'ada',
    'profile:gender': 'female',
  }
)
addOpenGraph(
  'og-music-song',
  {
    type: 'music.song',
    duration: 240,
    albums: { url: new URL('https://example.com/album'), disc: 1, track: 2 },
    musicians: ['https://example.com/musician'],
  },
  {
    'og:type': 'music.song',
    'music:duration': '240',
    'music:album': 'https://example.com/album',
    'music:album:disc': '1',
    'music:album:track': '2',
    'music:musician': 'https://example.com/musician',
  }
)
addOpenGraph(
  'og-music-album',
  {
    type: 'music.album',
    songs: { url: 'https://example.com/song', disc: 1, track: 2 },
    musicians: new URL('https://example.com/musician'),
    releaseDate: '2026-01-01',
  },
  {
    'og:type': 'music.album',
    'music:song': 'https://example.com/song',
    'music:song:disc': '1',
    'music:song:track': '2',
    'music:musician': 'https://example.com/musician',
    'music:release_date': '2026-01-01',
  }
)
addOpenGraph(
  'og-music-playlist',
  {
    type: 'music.playlist',
    songs: 'https://example.com/song',
    creators: 'https://example.com/creator',
  },
  {
    'og:type': 'music.playlist',
    'music:song': 'https://example.com/song',
    'music:creator': 'https://example.com/creator',
  }
)
addOpenGraph(
  'og-music-radio',
  {
    type: 'music.radio_station',
    creators: [
      'https://example.com/creator-a',
      new URL('https://example.com/creator-b'),
    ],
  },
  {
    'og:type': 'music.radio_station',
    'music:creator': [
      'https://example.com/creator-a',
      'https://example.com/creator-b',
    ],
  }
)
addOpenGraph(
  'og-video-movie',
  {
    type: 'video.movie',
    actors: [
      { url: 'https://example.com/actor-a', role: 'Lead' },
      new URL('https://example.com/actor-b'),
    ],
    directors: 'https://example.com/director',
    writers: ['https://example.com/writer'],
    duration: 120,
    releaseDate: '2026-01-01',
    tags: ['Drama', 'Film'],
  },
  {
    'og:type': 'video.movie',
    'video:actor': [
      'https://example.com/actor-a',
      'https://example.com/actor-b',
    ],
    'video:actor:role': 'Lead',
    'video:director': 'https://example.com/director',
    'video:writer': 'https://example.com/writer',
    'video:duration': '120',
    'video:release_date': '2026-01-01',
    'video:tag': ['Drama', 'Film'],
  }
)
addOpenGraph(
  'og-video-episode',
  {
    type: 'video.episode',
    actors: 'https://example.com/actor',
    directors: ['https://example.com/director'],
    writers: new URL('https://example.com/writer'),
    duration: 60,
    releaseDate: '2026-01-01',
    tags: 'Drama',
    series: new URL('https://example.com/series'),
  },
  {
    'og:type': 'video.episode',
    'video:actor': 'https://example.com/actor',
    'video:director': 'https://example.com/director',
    'video:writer': 'https://example.com/writer',
    'video:duration': '60',
    'video:release_date': '2026-01-01',
    'video:tag': 'Drama',
    'video:series': 'https://example.com/series',
  }
)
addOpenGraph(
  'og-video-tv-show',
  { type: 'video.tv_show' },
  { 'og:type': 'video.tv_show' }
)
addOpenGraph(
  'og-video-other',
  { type: 'video.other' },
  { 'og:type': 'video.other' }
)
addOpenGraph(
  'og-without-type',
  { title: 'No type', images: 'https://example.com/image.png' },
  {
    'og:title': 'No type',
    'og:image': 'https://example.com/image.png',
    'og:type': null,
  }
)
for (const determiner of ['a', 'an', 'the', 'auto', ''] as const) {
  addOpenGraph(
    `og-determiner-${determiner || 'empty'}`,
    { determiner },
    { 'og:determiner': determiner || null }
  )
}

const twitterCommon = {
  site: '@example',
  siteId: '123',
  creator: '@author',
  creatorId: '456',
  title: { absolute: 'Twitter title' },
  description: 'Twitter description',
  images: {
    url: '/twitter.png',
    alt: 'Twitter image',
    secureUrl: 'https://example.com/twitter-secure.png',
    type: 'image/png',
    width: 800,
    height: 600,
  },
}
const twitterExpected: NonNullable<Expected['names']> = {
  'twitter:site': '@example',
  'twitter:site:id': '123',
  'twitter:creator': '@author',
  'twitter:creator:id': '456',
  'twitter:title': 'Twitter title',
  'twitter:description': 'Twitter description',
  'twitter:image': 'https://example.com/twitter.png',
  'twitter:image:alt': 'Twitter image',
  'twitter:image:secure_url': 'https://example.com/twitter-secure.png',
  'twitter:image:type': 'image/png',
  'twitter:image:width': '800',
  'twitter:image:height': '600',
}
for (const card of ['summary', 'summary_large_image'] as const) {
  cases.push({
    name: `twitter-${card}`,
    metadata: { twitter: { ...twitterCommon, card } },
    expected: { names: { ...twitterExpected, 'twitter:card': card } },
  })
}
cases.push({
  name: 'twitter-player',
  metadata: {
    twitter: {
      ...twitterCommon,
      card: 'player',
      players: {
        playerUrl: 'https://example.com/player',
        streamUrl: new URL('https://example.com/stream'),
        width: 1280,
        height: 720,
      },
    },
  },
  expected: {
    names: {
      ...twitterExpected,
      'twitter:card': 'player',
      'twitter:player': 'https://example.com/player',
      'twitter:player:stream': 'https://example.com/stream',
      'twitter:player:width': '1280',
      'twitter:player:height': '720',
    },
  },
})
cases.push({
  name: 'twitter-player-array',
  metadata: {
    twitter: {
      card: 'player',
      players: [
        {
          playerUrl: 'https://example.com/player-a',
          streamUrl: 'https://example.com/stream-a',
          width: 800,
          height: 600,
        },
        {
          playerUrl: new URL('https://example.com/player-b'),
          streamUrl: 'https://example.com/stream-b',
          width: 1280,
          height: 720,
        },
      ],
    },
  },
  expected: {
    names: {
      'twitter:card': 'player',
      'twitter:player': [
        'https://example.com/player-a',
        'https://example.com/player-b',
      ],
      'twitter:player:stream': [
        'https://example.com/stream-a',
        'https://example.com/stream-b',
      ],
      'twitter:player:width': ['800', '1280'],
      'twitter:player:height': ['600', '720'],
    },
  },
})
cases.push({
  name: 'twitter-app',
  metadata: {
    twitter: {
      ...twitterCommon,
      card: 'app',
      app: {
        id: { iphone: 123, ipad: '456', googleplay: 'com.example.app' },
        url: {
          iphone: new URL('https://example.com/iphone'),
          ipad: 'https://example.com/ipad',
          googleplay: 'https://example.com/android',
        },
        name: 'Example App',
      },
    },
  },
  expected: {
    names: {
      ...twitterExpected,
      'twitter:card': 'app',
      'twitter:app:id:iphone': '123',
      'twitter:app:id:ipad': '456',
      'twitter:app:id:googleplay': 'com.example.app',
      'twitter:app:url:iphone': 'https://example.com/iphone',
      'twitter:app:url:ipad': 'https://example.com/ipad',
      'twitter:app:url:googleplay': 'https://example.com/android',
      'twitter:app:name:iphone': 'Example App',
      'twitter:app:name:ipad': 'Example App',
      'twitter:app:name:googleplay': 'Example App',
    },
  },
})
cases.push({
  name: 'twitter-default-summary',
  metadata: { twitter: { title: 'Summary' } },
  expected: {
    names: { 'twitter:card': 'summary', 'twitter:title': 'Summary' },
  },
})
cases.push({
  name: 'twitter-default-large-image',
  metadata: { twitter: { images: new URL('https://example.com/image.png') } },
  expected: {
    names: {
      'twitter:card': 'summary_large_image',
      'twitter:image': 'https://example.com/image.png',
    },
  },
})
cases.push({
  name: 'social-fallback',
  metadata: {
    title: 'Document title',
    description: 'Document description',
    openGraph: { images: '/fallback.png' },
  },
  expected: {
    title: 'Document title',
    names: {
      'twitter:card': 'summary_large_image',
      'twitter:title': 'Document title',
      'twitter:description': 'Document description',
      'twitter:image': 'https://example.com/fallback.png',
    },
    properties: {
      'og:title': 'Document title',
      'og:description': 'Document description',
      'og:image': 'https://example.com/fallback.png',
    },
  },
})

for (const colorScheme of [
  'normal',
  'light',
  'dark',
  'light dark',
  'dark light',
  'only light',
] as const) {
  cases.push({
    name: `color-scheme-${colorScheme.replace(/ /g, '-')}`,
    viewport: { colorScheme },
    expected: { names: { 'color-scheme': colorScheme } },
  })
}
for (const viewportFit of ['auto', 'contain', 'cover'] as const) {
  cases.push({
    name: `viewport-fit-${viewportFit}`,
    viewport: { viewportFit },
    expected: {
      names: {
        viewport: `width=device-width, initial-scale=1, viewport-fit=${viewportFit}`,
      },
    },
  })
}
for (const interactiveWidget of [
  'resizes-visual',
  'resizes-content',
  'overlays-content',
] as const) {
  cases.push({
    name: `interactive-widget-${interactiveWidget}`,
    viewport: { interactiveWidget },
    expected: {
      names: {
        viewport: `width=device-width, initial-scale=1, interactive-widget=${interactiveWidget}`,
      },
    },
  })
}
cases.push(
  {
    name: 'viewport-numeric',
    viewport: { width: 800, height: 600, userScalable: false },
    expected: {
      names: {
        viewport: 'width=800, height=600, initial-scale=1, user-scalable=no',
      },
    },
  },
  {
    name: 'viewport-no-initial-scale',
    viewport: { initialScale: undefined },
    expected: { names: { viewport: 'width=device-width' } },
  },
  {
    name: 'viewport-no-width',
    viewport: { width: undefined },
    expected: { names: { viewport: 'initial-scale=1' } },
  },
  {
    name: 'theme-color-string',
    viewport: { themeColor: 'cyan' },
    expected: { names: { 'theme-color': 'cyan' } },
  },
  {
    name: 'theme-color-object',
    viewport: {
      themeColor: { color: 'black', media: '(prefers-color-scheme: dark)' },
    },
    expected: { names: { 'theme-color': 'black' } },
  }
)
for (const referrer of [
  'no-referrer',
  'origin',
  'no-referrer-when-downgrade',
  'origin-when-cross-origin',
  'same-origin',
  'strict-origin',
  'strict-origin-when-cross-origin',
] as const) {
  cases.push({
    name: `referrer-${referrer}`,
    metadata: { referrer },
    expected: { names: { referrer } },
  })
}
for (const statusBarStyle of [
  'default',
  'black',
  'black-translucent',
] as const) {
  cases.push({
    name: `apple-style-${statusBarStyle}`,
    metadata: { appleWebApp: { statusBarStyle } },
    expected: {
      names: {
        'mobile-web-app-capable': 'yes',
        'apple-mobile-web-app-status-bar-style': statusBarStyle,
      },
    },
  })
}
for (const fetchPriority of ['high', 'low', 'auto'] as const) {
  cases.push({
    name: `icon-priority-${fetchPriority}`,
    metadata: { icons: { icon: { url: '/icon.png', fetchPriority } } },
    expected: {
      links: [
        {
          selector: 'link[rel="icon"]',
          attributes: { href: '/icon.png', fetchpriority: fetchPriority },
        },
      ],
    },
  })
}
for (const metadataBase of [
  'https://base.example.com/prefix',
  new URL('https://base.example.com/prefix'),
]) {
  cases.push({
    name: `metadata-base-${typeof metadataBase === 'string' ? 'string' : 'url'}`,
    metadata: {
      metadataBase,
      openGraph: { url: '/page', images: '/image.png' },
    },
    expected: {
      properties: {
        'og:url': 'https://base.example.com/prefix/page',
        'og:image': 'https://base.example.com/prefix/image.png',
      },
    },
  })
}

export function getCase(name: string): MetadataCase {
  const value = cases.find((testCase) => testCase.name === name)
  if (!value) throw new Error(`Unknown metadata case: ${name}`)
  return value
}
