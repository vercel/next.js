// When rendering applink meta tags add a namespace tag before each array instance
// if more than one member exists.
// ref: https://developers.facebook.com/docs/applinks/metadata-reference

import z from 'next/dist/compiled/zod'

const AppLinksAppleSchema = z.object({
  url: z.union([z.string(), z.instanceof(URL)]),
  app_store_id: z.union([z.string(), z.number()]).optional(),
  app_name: z.string().optional(),
})

const AppLinksAndroidSchema = z.object({
  package: z.string(),
  url: z.union([z.string(), z.instanceof(URL)]).optional(),
  class: z.string().optional(),
  app_name: z.string().optional(),
})

const AppLinksWindowsSchema = z.object({
  url: z.union([z.string(), z.instanceof(URL)]),
  app_id: z.string().optional(),
  app_name: z.string().optional(),
})

const AppLinksWebSchema = z.object({
  url: z.union([z.string(), z.instanceof(URL)]),
  should_fallback: z.boolean().optional(),
})

export const AppLinksSchema = z.object({
  ios: z.union([AppLinksAppleSchema, z.array(AppLinksAppleSchema)]).optional(),
  iphone: z.union([AppLinksAppleSchema, z.array(AppLinksAppleSchema)]).optional(),
  ipad: z.union([AppLinksAppleSchema, z.array(AppLinksAppleSchema)]).optional(),
  android: z.union([AppLinksAndroidSchema, z.array(AppLinksAndroidSchema)]).optional(),
  windows_phone: z.union([AppLinksWindowsSchema, z.array(AppLinksWindowsSchema)]).optional(),
  windows: z.union([AppLinksWindowsSchema, z.array(AppLinksWindowsSchema)]).optional(),
  windows_universal: z.union([AppLinksWindowsSchema, z.array(AppLinksWindowsSchema)]).optional(),
  web: z.union([AppLinksWebSchema, z.array(AppLinksWebSchema)]).optional(),
})

export const ResolvedAppLinksSchema = z.object({
  ios: z.array(AppLinksAppleSchema).optional(),
  iphone: z.array(AppLinksAppleSchema).optional(),
  ipad: z.array(AppLinksAppleSchema).optional(),
  android: z.array(AppLinksAndroidSchema).optional(),
  windows_phone: z.array(AppLinksWindowsSchema).optional(),
  windows: z.array(AppLinksWindowsSchema).optional(),
  windows_universal: z.array(AppLinksWindowsSchema).optional(),
  web: z.array(AppLinksWebSchema).optional(),
})

// Apple Itunes App
// https://developer.apple.com/documentation/webkit/promoting_apps_with_smart_app_banners
export const ItunesAppSchema = z.object({
  appId: z.string(),
  appArgument: z.string().optional(),
})

// Viewport meta structure
// https://developer.mozilla.org/en-US/docs/Web/HTML/Viewport_meta_tag
// intentionally leaving out user-scalable, use a string if you want that behavior
export const ViewportSchema = z.object({
  width: z.union([z.string(), z.number()]).optional(),
  height: z.union([z.string(), z.number()]).optional(),
  initialScale: z.number().optional(),
  minimumScale: z.number().optional(),
  maximumScale: z.number().optional(),
})

const AppleImageDescriptorSchema = z.object({
  url: z.string(),
  media: z.string().optional(),
})

const AppleImageSchema = z.union([z.string(), AppleImageDescriptorSchema])

// Apple Web App
// https://developer.apple.com/library/archive/documentation/AppleApplications/Reference/SafariHTMLRef/Articles/MetaTags.html
// https://developer.apple.com/library/archive/documentation/AppleApplications/Reference/SafariWebContent/ConfiguringWebApplications/ConfiguringWebApplications.html
export const AppleWebAppSchema = z.object({
  /**
   * @default true
   */
  capable: z.boolean().optional(),
  title: z.string().optional(),
  startupImage: z.union([AppleImageSchema, z.array(AppleImageSchema)]).optional(),
  /**
   * @default 'default'
   */
  statusBarStyle: z.enum(['default', 'black', 'black-translucent']).optional(),
})

export const ResolvedAppleWebAppSchema = z.object({
  capable: z.boolean(),
  title: z.union([z.string(), z.null()]).optional(),
  startupImage: z.union([z.array(AppleImageDescriptorSchema), z.null()]).optional(),
  statusBarStyle: z.enum(['default', 'black', 'black-translucent']).optional(),
})

// Format Detection
// This is a poorly specified metadata export type that is supposed to
// control whether the device attempts to conver text that matches
// certain formats into links for action. The most supported example
// is how mobile devices detect phone numbers and make them into links
// that can initiate a phone call
// https://www.goodemailcode.com/email-code/template.html
export const FormatDetectionSchema = z.object({
  telephone: z.boolean().optional(),
  date: z.boolean().optional(),
  address: z.boolean().optional(),
  email: z.boolean().optional(),
  url: z.boolean().optional(),
})

// Types
export type AppLinks = z.infer<typeof AppLinksSchema>
export type ResolvedAppLinks = z.infer<typeof ResolvedAppLinksSchema>
export type AppLinksApple = z.infer<typeof AppLinksAppleSchema>
export type AppLinksAndroid = z.infer<typeof AppLinksAndroidSchema>
export type AppLinksWindows = z.infer<typeof AppLinksWindowsSchema>
export type AppLinksWeb = z.infer<typeof AppLinksWebSchema>
export type ItunesApp = z.infer<typeof ItunesAppSchema>
export type Viewport = z.infer<typeof ViewportSchema>
export type AppleWebApp = z.infer<typeof AppleWebAppSchema>
export type AppleImage = z.infer<typeof AppleImageSchema>
export type AppleImageDescriptor = z.infer<typeof AppleImageDescriptorSchema>
export type ResolvedAppleWebApp = z.infer<typeof ResolvedAppleWebAppSchema>
export type FormatDetection = z.infer<typeof FormatDetectionSchema>
