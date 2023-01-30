import z from 'next/dist/compiled/zod'

import { AbsoluteTemplateStringSchema, TemplateStringSchema } from './metadata-types'

const OpenGraphTypeSchema = z.enum([
  'article',
  'book',
  'music.song',
  'music.album',
  'music.playlist',
  'music.radio_station',
  'profile',
  'website',
  'video.tv_show',
  'video.other',
  'video.movie',
  'video.episode',
])

// update this type to reflect actual locales
const LocaleSchema = z.string()

const OGImageDescriptorSchema = z.object({
  url: z.union([z.string(), z.instanceof(URL)]),
  secureUrl: z.union([z.string(), z.instanceof(URL)]).optional(),
  alt: z.string().optional(),
  type: z.string().optional(),
  width: z.union([z.string(), z.number()]).optional(),
  height: z.union([z.string(), z.number()]).optional(),
})
const OGImageSchema = z.union([z.string(), OGImageDescriptorSchema, z.instanceof(URL)])

const OGAudioDescriptorSchema = z.object({
  url: z.union([z.string(), z.instanceof(URL)]),
  secureUrl: z.union([z.string(), z.instanceof(URL)]).optional(),
  type: z.string().optional(),
})

const OGAudioSchema = z.union([z.string(), OGAudioDescriptorSchema, z.instanceof(URL)])

const OGVideoDescriptorSchema = z.object({
  url: z.union([z.string(), z.instanceof(URL)]),
  secureUrl: z.union([z.string(), z.instanceof(URL)]).optional(),
  type: z.string().optional(),
  width: z.union([z.string(), z.number()]).optional(),
  height: z.union([z.string(), z.number()]).optional(),
})

const OGVideoSchema = z.union([z.string(), OGVideoDescriptorSchema, z.instanceof(URL)])

const OpenGraphMetadataSchema = z.object({
  determiner: z.enum(['a', 'an', 'the', 'auto', '']).optional(),
  title: TemplateStringSchema.optional(),
  description: z.string().optional(),
  emails: z.union([z.string(), z.array(z.string())]).optional(),
  phoneNumbers: z.union([z.string(), z.array(z.string())]).optional(),
  faxNumbers: z.union([z.string(), z.array(z.string())]).optional(),
  siteName: z.string().optional(),
  locale: LocaleSchema.optional(),
  alternateLocale: z.union([LocaleSchema, z.array(LocaleSchema)]).optional(),
  images: z.union([OGImageSchema, z.array(OGImageSchema)]).optional(),
  audio: z.union([OGAudioSchema, z.array(OGAudioSchema)]).optional(),
  videos: z.union([OGVideoSchema, z.array(OGVideoSchema)]).optional(),
  url: z.union([z.string(), z.instanceof(URL)]).optional(),
  countryName: z.string().optional(),
  ttl: z.number().optional(),
})

const OpenGraphWebsiteSchema = OpenGraphMetadataSchema.extend({
  type: z.literal('website'),
})

const OpenGraphArticleSchema = OpenGraphMetadataSchema.extend({
  type: z.literal('article'),
  publishedTime: z.string().optional(),
  modifiedTime: z.string().optional(),
  expirationTime: z.string().optional(),
  authors: z.union([z.null(), z.string(), z.array(z.union([z.string(), z.instanceof(URL)]))]).optional(),
  section: z.union([z.null(), z.string()]).optional(),
  tags: z.union([z.null(), z.string(), z.array(z.string())]).optional(),
})

const OpenGraphBookSchema = OpenGraphMetadataSchema.extend({
  type: z.literal('book'),
  isbn: z.union([z.null(), z.string()]).optional(),
  releaseDate: z.union([z.null(), z.string()]).optional(),
  authors: z
    .union([z.null(), z.string(), z.instanceof(URL), z.array(z.union([z.string(), z.instanceof(URL)]))])
    .optional(),
  tags: z.union([z.null(), z.string(), z.array(z.string())]).optional(),
})

const OpenGraphProfileSchema = OpenGraphMetadataSchema.extend({
  type: z.literal('profile'),
  firstName: z.union([z.null(), z.string()]).optional(),
  lastName: z.union([z.null(), z.string()]).optional(),
  username: z.union([z.null(), z.string()]).optional(),
  gender: z.union([z.null(), z.string()]).optional(),
})

const OGSongSchema = z.object({
  url: z.union([z.string(), z.instanceof(URL)]),
  disc: z.number().optional(),
  track: z.number().optional(),
})

const OGAlbumSchema = z.object({
  url: z.union([z.string(), z.instanceof(URL)]),
  disc: z.number().optional(),
  track: z.number().optional(),
})

const OGActorSchema = z.object({
  url: z.union([z.string(), z.instanceof(URL)]),
  role: z.string().optional(),
})

const OpenGraphMusicSongSchema = OpenGraphMetadataSchema.extend({
  type: z.literal('music.song'),
  duration: z.union([z.null(), z.number()]).optional(),
  albums: z
    .union([
      z.null(),
      z.string(),
      z.instanceof(URL),
      OGAlbumSchema,
      z.array(z.union([z.string(), z.instanceof(URL), OGAlbumSchema])),
    ])
    .optional(),
  musicians: z
    .union([z.null(), z.string(), z.instanceof(URL), z.array(z.union([z.string(), z.instanceof(URL)]))])
    .optional(),
})

const OpenGraphMusicAlbumSchema = OpenGraphMetadataSchema.extend({
  type: z.literal('music.album'),
  songs: z
    .union([
      z.null(),
      z.string(),
      z.instanceof(URL),
      OGSongSchema,
      z.array(z.union([z.string(), z.instanceof(URL), OGSongSchema])),
    ])
    .optional(),
  musicians: z
    .union([z.null(), z.string(), z.instanceof(URL), z.array(z.union([z.string(), z.instanceof(URL)]))])
    .optional(),
  releaseDate: z.union([z.null(), z.string()]).optional(),
})

const OpenGraphMusicPlaylistSchema = OpenGraphMetadataSchema.extend({
  type: z.literal('music.playlist'),
  songs: z
    .union([
      z.null(),
      z.string(),
      z.instanceof(URL),
      OGSongSchema,
      z.array(z.union([z.string(), z.instanceof(URL), OGSongSchema])),
    ])
    .optional(),
  creators: z
    .union([z.null(), z.string(), z.instanceof(URL), z.array(z.union([z.string(), z.instanceof(URL)]))])
    .optional(),
})

const OpenGraphRadioStationSchema = OpenGraphMetadataSchema.extend({
  type: z.literal('music.radio_station'),
  creators: z
    .union([z.null(), z.string(), z.instanceof(URL), z.array(z.union([z.string(), z.instanceof(URL)]))])
    .optional(),
})

const OpenGraphVideoMovieSchema = OpenGraphMetadataSchema.extend({
  type: z.literal('video.movie'),
  actors: z
    .union([
      z.null(),
      z.string(),
      z.instanceof(URL),
      OGActorSchema,
      z.array(z.union([z.string(), z.instanceof(URL), OGActorSchema])),
    ])
    .optional(),
  directors: z
    .union([z.null(), z.string(), z.instanceof(URL), z.array(z.union([z.string(), z.instanceof(URL)]))])
    .optional(),
  writers: z
    .union([z.null(), z.string(), z.instanceof(URL), z.array(z.union([z.string(), z.instanceof(URL)]))])
    .optional(),
  duration: z.number().optional(),
  releaseDate: z.string().optional(),
  tags: z.union([z.null(), z.string(), z.array(z.string())]).optional(),
})

const OpenGraphVideoEpisodeSchema = OpenGraphMetadataSchema.extend({
  type: z.literal('video.episode'),
  actors: z
    .union([
      z.null(),
      z.string(),
      z.instanceof(URL),
      OGActorSchema,
      z.array(z.union([z.string(), z.instanceof(URL), OGActorSchema])),
    ])
    .optional(),
  directors: z
    .union([z.null(), z.string(), z.instanceof(URL), z.array(z.union([z.string(), z.instanceof(URL)]))])
    .optional(),
  writers: z
    .union([z.null(), z.string(), z.instanceof(URL), z.array(z.union([z.string(), z.instanceof(URL)]))])
    .optional(),
  duration: z.union([z.null(), z.number()]).optional(),
  releaseDate: z.union([z.null(), z.string()]).optional(),
  tags: z.union([z.null(), z.string(), z.array(z.string())]).optional(),
  series: z.union([z.null(), z.string(), z.instanceof(URL)]).optional(),
})

const OpenGraphVideoTVShowSchema = OpenGraphMetadataSchema.extend({
  type: z.literal('video.tv_show'),
})

const OpenGraphVideoOtherSchema = OpenGraphMetadataSchema.extend({
  type: z.literal('video.other'),
})

export const OpenGraphSchema = z.union([
  OpenGraphWebsiteSchema,
  OpenGraphArticleSchema,
  OpenGraphBookSchema,
  OpenGraphProfileSchema,
  OpenGraphMusicSongSchema,
  OpenGraphMusicAlbumSchema,
  OpenGraphMusicPlaylistSchema,
  OpenGraphRadioStationSchema,
  OpenGraphVideoMovieSchema,
  OpenGraphVideoEpisodeSchema,
  OpenGraphVideoTVShowSchema,
  OpenGraphVideoOtherSchema,
  OpenGraphMetadataSchema,
])

const ResolvedOpenGraphMetadataSchema = z.object({
  determiner: z.enum(['a', 'an', 'the', 'auto', '']).optional(),
  title: AbsoluteTemplateStringSchema.optional(),
  description: z.string().optional(),
  emails: z.array(z.string()).optional(),
  phoneNumbers: z.array(z.string()).optional(),
  faxNumbers: z.array(z.string()).optional(),
  siteName: z.string().optional(),
  locale: LocaleSchema.optional(),
  alternateLocale: z.array(LocaleSchema).optional(),
  images: z.array(OGImageSchema).optional(),
  audio: z.array(OGAudioSchema).optional(),
  videos: z.array(OGVideoSchema).optional(),
  url: z.instanceof(URL).optional(),
  countryName: z.string().optional(),
  ttl: z.number().optional(),
})

const ResolvedOpenGraphWebsiteSchema = ResolvedOpenGraphMetadataSchema.extend({
  type: z.literal('website'),
})

const ResolvedOpenGraphArticleSchema = ResolvedOpenGraphMetadataSchema.extend({
  type: z.literal('article'),
  publishedTime: z.string().optional(),
  modifiedTime: z.string().optional(),
  expirationTime: z.string().optional(),
  authors: z.array(z.string()).optional(),
  section: z.string().optional(),
  tags: z.array(z.string()).optional(),
})

const ResolvedOpenGraphBookSchema = ResolvedOpenGraphMetadataSchema.extend({
  type: z.literal('book'),
  isbn: z.string().optional(),
  releaseDate: z.string().optional(),
  authors: z.array(z.string()).optional(),
  tags: z.array(z.string()).optional(),
})

const ResolvedOpenGraphProfileSchema = ResolvedOpenGraphMetadataSchema.extend({
  type: z.literal('profile'),
  firstName: z.string().optional(),
  lastName: z.string().optional(),
  username: z.string().optional(),
  gender: z.string().optional(),
})

const ResolvedOpenGraphMusicSongSchema = ResolvedOpenGraphMetadataSchema.extend({
  type: z.literal('music.song'),
  duration: z.number().optional(),
  albums: z.array(OGAlbumSchema).optional(),
  musicians: z.array(z.union([z.string(), z.instanceof(URL)])).optional(),
})

const ResolvedOpenGraphMusicAlbumSchema = ResolvedOpenGraphMetadataSchema.extend({
  type: z.literal('music.album'),
  songs: z.array(z.union([z.string(), z.instanceof(URL), OGSongSchema])).optional(),
  musicians: z.array(z.union([z.string(), z.instanceof(URL)])).optional(),
  releaseDate: z.string().optional(),
})

const ResolvedOpenGraphMusicPlaylistSchema = ResolvedOpenGraphMetadataSchema.extend({
  type: z.literal('music.playlist'),
  songs: z.array(z.union([z.string(), z.instanceof(URL), OGSongSchema])).optional(),
  creators: z.array(z.union([z.string(), z.instanceof(URL)])).optional(),
})

const ResolvedOpenGraphRadioStationSchema = ResolvedOpenGraphMetadataSchema.extend({
  type: z.literal('music.radio_station'),
  creators: z.array(z.union([z.string(), z.instanceof(URL)])).optional(),
})

const ResolvedOpenGraphVideoMovieSchema = ResolvedOpenGraphMetadataSchema.extend({
  type: z.literal('video.movie'),
  actors: z.array(z.union([z.string(), z.instanceof(URL), OGActorSchema])).optional(),
  directors: z.array(z.union([z.string(), z.instanceof(URL)])).optional(),
  writers: z.array(z.union([z.string(), z.instanceof(URL)])).optional(),
  duration: z.number().optional(),
  releaseDate: z.string().optional(),
  tags: z.array(z.string()).optional(),
})

const ResolvedOpenGraphVideoEpisodeSchema = ResolvedOpenGraphMetadataSchema.extend({
  type: z.literal('video.episode'),
  actors: z.array(z.union([z.string(), z.instanceof(URL), OGActorSchema])).optional(),
  directors: z.array(z.union([z.string(), z.instanceof(URL)])).optional(),
  writers: z.array(z.union([z.string(), z.instanceof(URL)])).optional(),
  duration: z.number().optional(),
  releaseDate: z.string().optional(),
  tags: z.array(z.string()).optional(),
  series: z.union([z.string(), z.instanceof(URL)]).optional(),
})

const ResolvedOpenGraphVideoTVShowSchema = ResolvedOpenGraphMetadataSchema.extend({
  type: z.literal('video.tv_show'),
})

const ResolvedOpenGraphVideoOtherSchema = ResolvedOpenGraphMetadataSchema.extend({
  type: z.literal('video.other'),
})

export const ResolvedOpenGraphSchema = z.union([
  ResolvedOpenGraphWebsiteSchema,
  ResolvedOpenGraphArticleSchema,
  ResolvedOpenGraphBookSchema,
  ResolvedOpenGraphProfileSchema,
  ResolvedOpenGraphMusicSongSchema,
  ResolvedOpenGraphMusicAlbumSchema,
  ResolvedOpenGraphMusicPlaylistSchema,
  ResolvedOpenGraphRadioStationSchema,
  ResolvedOpenGraphVideoMovieSchema,
  ResolvedOpenGraphVideoEpisodeSchema,
  ResolvedOpenGraphVideoTVShowSchema,
  ResolvedOpenGraphVideoOtherSchema,
  ResolvedOpenGraphMetadataSchema,
])

// Types
export type OpenGraphType = z.infer<typeof OpenGraphTypeSchema>
export type OpenGraph = z.infer<typeof OpenGraphSchema>
export type ResolvedOpenGraph = z.infer<typeof ResolvedOpenGraphSchema>
