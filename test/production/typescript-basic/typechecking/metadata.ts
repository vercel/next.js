// noinspection BadExpressionStatementJS,ES6PreferShortImport

import {
  AppleImageDescriptor,
  AppleWebApp,
  AppLinks,
  AppLinksAndroid,
  AppLinksApple,
  AppLinksWeb,
  AppLinksWindows,
  FacebookAdmins,
  FacebookAppId,
  FormatDetection,
  ItunesApp,
  ResolvedAppleWebApp,
  ResolvedAppLinks,
  ResolvedFacebook,
  ViewportLayout,
} from '../../../../packages/next/src/lib/metadata/types/extra-types'
import {
  AlternateLinkDescriptor,
  AlternateURLs,
  Languages,
} from '../../../../packages/next/src/lib/metadata/types/alternative-urls-types'
import { Manifest } from '../../../../packages/next/src/lib/metadata/types/manifest-types'
import {
  Metadata,
  MetadataRoute,
  Viewport,
} from '../../../../packages/next/src/lib/metadata/types/metadata-interface'
import {
  DeprecatedMetadataFields,
  Author,
  Robots,
  IconDescriptor,
  Icons,
  Verification,
  ResolvedVerification,
  ResolvedIcons,
  ThemeColorDescriptor,
  Videos,
} from '../../../../packages/next/src/lib/metadata/types/metadata-types'
import {
  OpenGraph,
  ResolvedOpenGraph,
} from '../../../../packages/next/src/lib/metadata/types/opengraph-types'
import {
  Twitter,
  ResolvedTwitterMetadata,
} from '../../../../packages/next/src/lib/metadata/types/twitter-types'
;({
  en: undefined,
}) satisfies Languages<unknown>
;({
  title: undefined,
  url: '',
}) satisfies AlternateLinkDescriptor
;({
  canonical: undefined,
  languages: undefined,
  media: undefined,
  types: undefined,
}) satisfies AlternateURLs
;({
  ios: undefined,
  iphone: undefined,
  ipad: undefined,
  android: undefined,
  windows_phone: undefined,
  windows: undefined,
  windows_universal: undefined,
  web: undefined,
}) satisfies AppLinks
;({
  ios: undefined,
  iphone: undefined,
  ipad: undefined,
  android: undefined,
  windows_phone: undefined,
  windows: undefined,
  windows_universal: undefined,
  web: undefined,
}) satisfies ResolvedAppLinks
;({
  url: '',
  app_store_id: undefined,
  app_name: undefined,
}) satisfies AppLinksApple
;({
  package: '',
  url: undefined,
  class: undefined,
  app_name: undefined,
}) satisfies AppLinksAndroid
;({
  url: '',
  app_id: undefined,
  app_name: undefined,
}) satisfies AppLinksWindows
;({
  url: '',
  should_fallback: undefined,
}) satisfies AppLinksWeb
;({
  appId: '',
  appArgument: undefined,
}) satisfies ItunesApp
;({
  width: undefined,
  height: undefined,
  initialScale: undefined,
  minimumScale: undefined,
  maximumScale: undefined,
  userScalable: undefined,
  viewportFit: undefined,
  interactiveWidget: undefined,
}) satisfies ViewportLayout
;({
  capable: undefined,
  title: undefined,
  startupImage: undefined,
  statusBarStyle: undefined,
}) satisfies AppleWebApp
;({
  url: '',
  media: undefined,
}) satisfies AppleImageDescriptor
;({
  capable: false,
  title: undefined,
  startupImage: undefined,
  statusBarStyle: undefined,
}) satisfies ResolvedAppleWebApp
;({
  appId: '',
  admins: undefined,
}) satisfies FacebookAppId
;({
  appId: undefined,
  admins: '',
}) satisfies FacebookAdmins
;({
  appId: undefined,
  admins: undefined,
}) satisfies ResolvedFacebook
;({
  telephone: undefined,
  date: undefined,
  address: undefined,
  email: undefined,
  url: undefined,
}) satisfies FormatDetection
;({
  background_color: undefined,
  categories: undefined,
  description: undefined,
  dir: undefined,
  display: undefined,
  display_override: undefined,
  file_handlers: undefined,
  icons: undefined,
  id: undefined,
  lang: undefined,
  launch_handler: undefined,
  name: undefined,
  orientation: undefined,
  prefer_related_applications: undefined,
  protocol_handlers: undefined,
  related_applications: undefined,
  scope: undefined,
  screenshots: undefined,
  share_target: undefined,
  short_name: undefined,
  shortcuts: undefined,
  start_url: undefined,
  theme_color: undefined,
}) satisfies Manifest
;({
  related_applications: [
    {
      platform: '',
      url: '',
      id: undefined,
    },
  ],
  screenshots: [
    {
      form_factor: undefined,
      label: undefined,
      platform: undefined,
      src: '',
      type: undefined,
      sizes: undefined,
    },
  ],
  share_target: {
    action: '',
    method: undefined,
    enctype: undefined,
    params: {
      title: undefined,
      text: undefined,
      url: undefined,
      files: undefined,
    },
  },
  shortcuts: [
    {
      name: '',
      short_name: undefined,
      description: undefined,
      url: '',
      icons: undefined,
    },
  ],
}) satisfies Manifest
;({
  related_applications: [
    {
      platform: '',
      url: '',
      id: undefined,
    },
  ],
  screenshots: [
    {
      form_factor: undefined,
      label: undefined,
      platform: undefined,
      src: '',
      type: undefined,
      sizes: undefined,
    },
  ],
  share_target: {
    action: '',
    method: undefined,
    enctype: undefined,
    params: {
      title: undefined,
      text: undefined,
      url: undefined,
      files: undefined,
    },
  },
  shortcuts: [
    {
      name: '',
      short_name: undefined,
      description: undefined,
      url: '',
      icons: undefined,
    },
  ],
}) satisfies Manifest
;({
  icons: [
    {
      src: '',
      type: undefined,
      sizes: undefined,
      purpose: undefined,
    },
  ],
}) satisfies Manifest
;({
  metadataBase: undefined,
  title: undefined,
  description: undefined,
  applicationName: undefined,
  authors: undefined,
  generator: undefined,
  keywords: undefined,
  referrer: undefined,
  themeColor: undefined,
  colorScheme: undefined,
  viewport: undefined,
  creator: undefined,
  publisher: undefined,
  robots: undefined,
  alternates: undefined,
  icons: undefined,
  manifest: undefined,
  openGraph: undefined,
  twitter: undefined,
  facebook: undefined,
  verification: undefined,
  appleWebApp: undefined,
  formatDetection: undefined,
  itunes: undefined,
  abstract: undefined,
  appLinks: undefined,
  archives: undefined,
  assets: undefined,
  bookmarks: undefined,
  category: undefined,
  classification: undefined,
  other: undefined,
}) satisfies Metadata
;({
  rules: {
    userAgent: undefined,
    allow: undefined,
    disallow: undefined,
    crawlDelay: undefined,
  },
  sitemap: undefined,
  host: undefined,
}) satisfies MetadataRoute.Robots
;({
  url: '',
  lastModified: undefined,
  changeFrequency: undefined,
  priority: undefined,
  alternates: undefined,
  images: undefined,
  videos: undefined,
}) satisfies MetadataRoute.Sitemap[number]
;({
  url: '',
  alternates: {
    languages: undefined,
  },
}) satisfies MetadataRoute.Sitemap[number]
;({
  themeColor: undefined,
  colorScheme: undefined,
}) satisfies Viewport
;({
  'apple-touch-fullscreen': undefined,
  'apple-touch-icon-precomposed': undefined,
}) satisfies DeprecatedMetadataFields
;({
  url: undefined,
  name: undefined,
}) satisfies Author
;({
  googleBot: undefined,

  index: undefined,
  follow: undefined,

  noindex: undefined,
  nofollow: undefined,

  noarchive: undefined,
  nosnippet: undefined,
  noimageindex: undefined,
  nocache: undefined,
  notranslate: undefined,
  indexifembedded: undefined,
  nositelinkssearchbox: undefined,
  unavailable_after: undefined,
  'max-video-preview': undefined,
  'max-image-preview': undefined,
  'max-snippet': undefined,
}) satisfies Robots
;({
  url: '',
  type: undefined,
  sizes: undefined,
  color: undefined,
  rel: undefined,
  media: undefined,
  fetchPriority: undefined,
}) satisfies IconDescriptor
;({
  icon: undefined,
  shortcut: undefined,
  apple: undefined,
  other: undefined,
}) satisfies Icons
;({
  google: undefined,
  yahoo: undefined,
  yandex: undefined,
  me: undefined,
  other: undefined,
}) satisfies Verification
;({
  google: undefined,
  yahoo: undefined,
  yandex: undefined,
  me: undefined,
  other: undefined,
}) satisfies ResolvedVerification
;({
  icon: [],
  apple: [],
  shortcut: undefined,
  other: undefined,
}) satisfies ResolvedIcons
;({
  color: '',
  media: undefined,
}) satisfies ThemeColorDescriptor
;({
  title: '',
  thumbnail_loc: '',
  description: '',
  content_loc: undefined,
  player_loc: undefined,
  duration: undefined,
  expiration_date: undefined,
  rating: undefined,
  view_count: undefined,
  publication_date: undefined,
  family_friendly: undefined,
  restriction: undefined,
  platform: undefined,
  requires_subscription: undefined,
  uploader: undefined,
  live: undefined,
  tag: undefined,
}) satisfies Videos
;({
  title: '',
  thumbnail_loc: '',
  description: '',
  uploader: {
    info: undefined,
    content: undefined,
  },
}) satisfies Videos
;({
  images: {
    url: '',
    secureUrl: undefined,
    alt: undefined,
    type: undefined,
    width: undefined,
    height: undefined,
  },
  audio: {
    url: '',
    secureUrl: undefined,
    type: undefined,
  },
  videos: {
    url: '',
    secureUrl: undefined,
    type: undefined,
    width: undefined,
    height: undefined,
  },
}) satisfies OpenGraph
;({
  determiner: undefined,
  title: undefined,
  description: undefined,
  emails: undefined,
  phoneNumbers: undefined,
  faxNumbers: undefined,
  siteName: undefined,
  locale: undefined,
  alternateLocale: undefined,
  images: undefined,
  audio: undefined,
  videos: undefined,
  url: undefined,
  countryName: undefined,
  ttl: undefined,
}) satisfies OpenGraph
;({
  type: 'article',
  publishedTime: undefined,
  modifiedTime: undefined,
  expirationTime: undefined,
  authors: undefined,
  section: undefined,
  tags: undefined,
}) satisfies OpenGraph
;({
  type: 'book',
  isbn: undefined,
  releaseDate: undefined,
  authors: undefined,
  tags: undefined,
}) satisfies OpenGraph
;({
  type: 'music.song',
  duration: undefined,
  albums: undefined,
  musicians: undefined,
}) satisfies OpenGraph
;({
  type: 'music.song',
  albums: {
    url: '',
    disc: undefined,
    track: undefined,
  },
}) satisfies OpenGraph
;({
  type: 'music.album',
  songs: undefined,
  musicians: undefined,
  releaseDate: undefined,
}) satisfies OpenGraph
;({
  type: 'music.album',
  songs: {
    url: '',
    disc: undefined,
    track: undefined,
  },
}) satisfies OpenGraph
;({
  type: 'music.playlist',
  songs: undefined,
  creators: undefined,
}) satisfies OpenGraph
;({
  type: 'music.radio_station',
  creators: undefined,
}) satisfies OpenGraph
;({
  type: 'video.movie',
  actors: undefined,
  directors: undefined,
  writers: undefined,
  duration: undefined,
  releaseDate: undefined,
  tags: undefined,
}) satisfies OpenGraph
;({
  type: 'video.movie',
  actors: {
    url: '',
    role: undefined,
  },
}) satisfies OpenGraph
;({
  type: 'video.episode',
  actors: undefined,
  directors: undefined,
  writers: undefined,
  duration: undefined,
  releaseDate: undefined,
  tags: undefined,
  series: undefined,
}) satisfies OpenGraph
;({
  determiner: undefined,
  title: { absolute: '', template: '' },
  description: undefined,
  emails: undefined,
  phoneNumbers: undefined,
  faxNumbers: undefined,
  siteName: undefined,
  locale: undefined,
  alternateLocale: undefined,
  images: undefined,
  audio: undefined,
  videos: undefined,
  url: null,
  countryName: undefined,
  ttl: undefined,
}) satisfies ResolvedOpenGraph
;({
  type: 'article',
  title: { absolute: '', template: '' },
  url: null,
  publishedTime: undefined,
  modifiedTime: undefined,
  expirationTime: undefined,
  authors: undefined,
  section: undefined,
  tags: undefined,
}) satisfies ResolvedOpenGraph
;({
  type: 'book',
  title: { absolute: '', template: '' },
  url: null,
  isbn: undefined,
  releaseDate: undefined,
  authors: undefined,
  tags: undefined,
}) satisfies ResolvedOpenGraph
;({
  type: 'music.song',
  title: { absolute: '', template: '' },
  url: null,
  duration: undefined,
  albums: undefined,
  musicians: undefined,
}) satisfies ResolvedOpenGraph
;({
  type: 'music.song',
  title: { absolute: '', template: '' },
  url: null,
  albums: [
    {
      url: '',
      disc: undefined,
      track: undefined,
    },
  ],
}) satisfies ResolvedOpenGraph
;({
  type: 'music.album',
  title: { absolute: '', template: '' },
  url: null,
  songs: undefined,
  musicians: undefined,
  releaseDate: undefined,
}) satisfies ResolvedOpenGraph
;({
  type: 'music.album',
  title: { absolute: '', template: '' },
  url: null,
  songs: [
    {
      url: '',
      disc: undefined,
      track: undefined,
    },
  ],
}) satisfies ResolvedOpenGraph
;({
  type: 'music.playlist',
  title: { absolute: '', template: '' },
  url: null,
  songs: undefined,
  creators: undefined,
}) satisfies ResolvedOpenGraph
;({
  type: 'music.radio_station',
  title: { absolute: '', template: '' },
  url: null,
  creators: undefined,
}) satisfies ResolvedOpenGraph
;({
  type: 'video.movie',
  title: { absolute: '', template: '' },
  url: null,
  actors: undefined,
  directors: undefined,
  writers: undefined,
  duration: undefined,
  releaseDate: undefined,
  tags: undefined,
}) satisfies ResolvedOpenGraph
;({
  type: 'video.movie',
  title: { absolute: '', template: '' },
  url: null,
  actors: [
    {
      url: '',
      role: undefined,
    },
  ],
}) satisfies ResolvedOpenGraph
;({
  type: 'video.episode',
  title: { absolute: '', template: '' },
  url: null,
  actors: undefined,
  directors: undefined,
  writers: undefined,
  duration: undefined,
  releaseDate: undefined,
  tags: undefined,
  series: undefined,
}) satisfies ResolvedOpenGraph
;({
  site: undefined,
  siteId: undefined,
  creator: undefined,
  creatorId: undefined,
  description: undefined,
  title: undefined,
  images: undefined,
}) satisfies Twitter
;({
  images: {
    url: '',
    alt: undefined,
    secureUrl: undefined,
    type: undefined,
    width: undefined,
    height: undefined,
  },
}) satisfies Twitter
;({
  card: 'app',
  app: {
    id: {
      iphone: undefined,
      ipad: undefined,
      googleplay: undefined,
    },
    url: undefined,
    name: undefined,
  },
}) satisfies Twitter
;({
  card: 'app',
  app: {
    id: {},
    url: {
      iphone: undefined,
      ipad: undefined,
      googleplay: undefined,
    },
  },
}) satisfies Twitter
;({
  card: 'summary',
  site: null,
  siteId: null,
  creator: null,
  creatorId: null,
  description: null,
  title: { absolute: '', template: '' },
  images: undefined,
}) satisfies ResolvedTwitterMetadata
;({
  card: 'summary',
  site: null,
  siteId: null,
  creator: null,
  creatorId: null,
  description: null,
  title: { absolute: '', template: '' },
  images: [
    {
      url: '',
      alt: undefined,
      secureUrl: undefined,
      type: undefined,
      width: undefined,
      height: undefined,
    },
  ],
}) satisfies ResolvedTwitterMetadata
