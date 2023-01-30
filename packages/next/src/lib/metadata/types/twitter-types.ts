// Reference: https://developer.twitter.com/en/docs/twitter-for-websites/cards/overview/markup

import z from 'next/dist/compiled/zod'

import { AbsoluteTemplateStringSchema, TemplateStringSchema } from './metadata-types'

const TwitterAppDescriptorSchema = z.object({
  id: z.object({
    iphone: z.union([z.string(), z.number()]).optional(),
    ipad: z.union([z.string(), z.number()]).optional(),
    googleplay: z.string().optional(),
  }),
  url: z.object({
    iphone: z.union([z.string(), z.instanceof(URL)]).optional(),
    ipad: z.union([z.string(), z.instanceof(URL)]).optional(),
    googleplay: z.union([z.string(), z.instanceof(URL)]).optional(),
  }),
  name: z.string().optional(),
})

const TwitterImageDescriptorSchema = z.object({
  url: z.union([z.string(), z.instanceof(URL)]),
  alt: z.string().optional(),
  secureUrl: z.union([z.string(), z.instanceof(URL)]).optional(),
  type: z.string().optional(),
  width: z.union([z.string(), z.number()]).optional(),
  height: z.union([z.string(), z.number()]).optional(),
})

const TwitterImageSchema = z.union([z.string(), TwitterImageDescriptorSchema, z.instanceof(URL)])

const TwitterPlayerDescriptorSchema = z.object({
  playerUrl: z.union([z.string(), z.instanceof(URL)]),
  streamUrl: z.union([z.string(), z.instanceof(URL)]),
  width: z.number(),
  height: z.number(),
})

const ResolvedTwitterImageSchema = z.object({
  url: z.string(),
  alt: z.string().optional(),
})
const ResolvedTwitterSummarySchema = z.object({
  site: z.union([z.string(), z.null()]),
  siteId: z.union([z.string(), z.null()]),
  creator: z.union([z.string(), z.null()]),
  creatorId: z.union([z.string(), z.null()]),
  description: z.union([z.string(), z.null()]),
  title: AbsoluteTemplateStringSchema,
  images: z.array(ResolvedTwitterImageSchema).optional(),
})

const ResolvedTwitterPlayerSchema = ResolvedTwitterSummarySchema.extend({
  players: z.array(TwitterPlayerDescriptorSchema),
})
const ResolvedTwitterAppSchema = ResolvedTwitterSummarySchema.extend({
  app: TwitterAppDescriptorSchema,
})

export const ResolvedTwitterMetadataSchema = z.union([
  ResolvedTwitterSummarySchema.extend({ card: z.literal('summary') }),
  ResolvedTwitterSummarySchema.extend({ card: z.literal('summary_large_image') }),
  ResolvedTwitterPlayerSchema.extend({ card: z.literal('player') }),
  ResolvedTwitterAppSchema.extend({ card: z.literal('app') }),
])

const TwitterMetadataSchema = z.object(
  /**
   * Defaults to card="summary"
   */
  {
    /**
     * Username for account associated to the site itself
     */
    site: z.string().optional(),
    /**
     * Id for account associated to the site itself
     */
    siteId: z.string().optional(),
    /**
     * Username for the account associated to the creator of the content on the site
     */
    creator: z.string().optional(),
    /**
     * Id for the account associated to the creator of the content on the site
     */
    creatorId: z.string().optional(),
    description: z.string().optional(),
    title: z.union([z.string(), TemplateStringSchema]).optional(),
    images: z.union([TwitterImageSchema, z.array(TwitterImageSchema)]).optional(),
  }
)

const TwitterSummarySchema = TwitterMetadataSchema.extend({
  card: z.literal('summary'),
})

const TwitterSummaryLargeImageSchema = TwitterMetadataSchema.extend({
  card: z.literal('summary_large_image'),
})

const TwitterPlayerSchema = TwitterMetadataSchema.extend({
  card: z.literal('player'),
  players: z.union([TwitterPlayerDescriptorSchema, z.array(TwitterPlayerDescriptorSchema)]),
})

const TwitterAppSchema = TwitterMetadataSchema.extend({
  card: z.literal('app'),
  app: TwitterAppDescriptorSchema,
})

export const TwitterSchema = z.union([
  TwitterSummarySchema,
  TwitterSummaryLargeImageSchema,
  TwitterPlayerSchema,
  TwitterAppSchema,
  TwitterMetadataSchema,
])

// Types
export type Twitter = z.infer<typeof TwitterSchema>
export type TwitterAppDescriptor = z.infer<typeof TwitterAppDescriptorSchema>
export type ResolvedTwitterMetadata = z.infer<typeof ResolvedTwitterMetadataSchema>
