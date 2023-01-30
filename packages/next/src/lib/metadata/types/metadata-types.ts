// Metadata types

import z from 'next/dist/compiled/zod'

const DefaultTemplateStringSchema = z.object({
  default: z.string(),
  template: z.string(),
})

export const AbsoluteTemplateStringSchema = z.object({
  absolute: z.string(),
  template: z.union([z.string(), z.null()]),
})

const AbsoluteStringSchema = z.object({
  absolute: z.string(),
})

export const TemplateStringSchema = z.union([
  DefaultTemplateStringSchema,
  AbsoluteTemplateStringSchema,
  AbsoluteStringSchema,
])

export const AuthorSchema = z.object({
  /**
   * renders as <link rel="author"...
   */
  url: z.union([z.string(), z.instanceof(URL)]).optional(),
  /**
   * renders as <meta name="author"...
   */
  name: z.string().optional(),
})

// does not include "unsafe-URL". to use this users should
// use '"unsafe-URL" as ReferrerEnum'
export const ReferrerEnumSchema = z.enum([
  'no-referrer',
  'origin',
  'no-referrer-when-downgrade',
  'origin-when-cross-origin',
  'same-origin',
  'strict-origin',
  'strict-origin-when-cross-origin',
])

export const ColorSchemeEnumSchema = z.enum(['normal', 'light', 'dark', 'light dark', 'dark light', 'only light'])

const RobotsInfoSchema = z.object({
  index: z.boolean().optional(),
  follow: z.boolean().optional(),
  /**
   * @deprecated set index to false instead
   */
  noindex: z.never().optional(),
  /**
   * @deprecated set follow to false instead
   */
  nofollow: z.never().optional(),
  noarchive: z.boolean().optional(),
  nosnippet: z.boolean().optional(),
  noimageindex: z.boolean().optional(),
  nocache: z.boolean().optional(),
})

export const RobotsSchema = RobotsInfoSchema.extend({
  // if you want to specify an alternate robots just for google
  googleBot: z.union([z.string(), RobotsInfoSchema]).optional(),
})

export const ResolvedRobotsSchema = z.object({
  basic: z.union([z.string(), z.null()]),
  googleBot: z.union([z.string(), z.null()]),
})

export const IconURLSchema = z.union([z.string(), z.instanceof(URL)])

const IconDescriptorSchema = z.object({
  url: IconURLSchema,
  type: z.string().optional(),
  sizes: z.string().optional(),
  // defaults to rel="icon" unless superceded by Icons map
  rel: z.string().optional(),
})

export const IconSchema = z.union([IconURLSchema, IconDescriptorSchema])

export const IconsSchema = z.object({
  /**
   * rel="icon"
   */
  icon: z.union([IconSchema, z.array(IconSchema)]).optional(),
  /**
   * rel="shortcut icon"
   */
  shortcut: z.union([IconSchema, z.array(IconSchema)]).optional(),
  /**
   * rel="apple-touch-icon"
   */
  apple: z.union([IconSchema, z.array(IconSchema)]).optional(),
  /**
   * rel inferred from descriptor, defaults to "icon"
   */
  other: z.union([IconDescriptorSchema, z.array(IconDescriptorSchema)]).optional(),
})

export const VerificationSchema = z.object({
  google: z.union([z.null(), z.string(), z.number(), z.array(z.union([z.string(), z.number()]))]).optional(),
  yahoo: z.union([z.null(), z.string(), z.number(), z.array(z.union([z.string(), z.number()]))]).optional(),
  // if you ad-hoc additional verification
  other: z.record(z.union([z.string(), z.number(), z.array(z.union([z.string(), z.number()]))])).optional(),
})

export const ResolvedVerificationSchema = z.object({
  google: z.union([z.null(), z.array(z.union([z.string(), z.number()]))]).optional(),
  yahoo: z.union([z.null(), z.array(z.union([z.string(), z.number()]))]).optional(),
  other: z.record(z.array(z.union([z.string(), z.number()]))).optional(),
})

export const ResolvedIconsSchema = z.object({
  icon: z.array(IconDescriptorSchema).optional(),
  shortcut: z.array(IconDescriptorSchema).optional(),
  apple: z.array(IconDescriptorSchema).optional(),
  other: z.array(IconDescriptorSchema).optional(),
})

// Types
export type AbsoluteTemplateString = z.infer<typeof AbsoluteTemplateStringSchema>
export type DefaultTemplateString = z.infer<typeof DefaultTemplateStringSchema>
export type AbsoluteString = z.infer<typeof AbsoluteStringSchema>
export type TemplateString = z.infer<typeof TemplateStringSchema>
export type Author = z.infer<typeof AuthorSchema>
export type ReferrerEnum = z.infer<typeof ReferrerEnumSchema>
export type ColorSchemeEnum = z.infer<typeof ColorSchemeEnumSchema>
export type RobotsInfo = z.infer<typeof RobotsInfoSchema>
export type Robots = z.infer<typeof RobotsSchema>
export type ResolvedRobots = z.infer<typeof ResolvedRobotsSchema>
export type IconURL = z.infer<typeof IconURLSchema>
export type IconDescriptor = z.infer<typeof IconDescriptorSchema>
export type Icon = z.infer<typeof IconSchema>
export type Icons = z.infer<typeof IconsSchema>
export type Verification = z.infer<typeof VerificationSchema>
export type ResolvedVerification = z.infer<typeof ResolvedVerificationSchema>
export type ResolvedIcons = z.infer<typeof ResolvedIconsSchema>
