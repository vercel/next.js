// When rendering applink meta tags add a namespace tag before each array instance
// if more than one member exists.
// ref: https://developers.facebook.com/docs/applinks/metadata-reference

export type AppLinks = {
  ios?: AppLinksApple | Array<AppLinksApple> | undefined
  iphone?: AppLinksApple | Array<AppLinksApple> | undefined
  ipad?: AppLinksApple | Array<AppLinksApple> | undefined
  android?: AppLinksAndroid | Array<AppLinksAndroid> | undefined
  windows_phone?: AppLinksWindows | Array<AppLinksWindows> | undefined
  windows?: AppLinksWindows | Array<AppLinksWindows> | undefined
  windows_universal?: AppLinksWindows | Array<AppLinksWindows> | undefined
  web?: AppLinksWeb | Array<AppLinksWeb> | undefined
}
export type ResolvedAppLinks = {
  ios?: Array<AppLinksApple> | undefined
  iphone?: Array<AppLinksApple> | undefined
  ipad?: Array<AppLinksApple> | undefined
  android?: Array<AppLinksAndroid> | undefined
  windows_phone?: Array<AppLinksWindows> | undefined
  windows?: Array<AppLinksWindows> | undefined
  windows_universal?: Array<AppLinksWindows> | undefined
  web?: Array<AppLinksWeb> | undefined
}
export type AppLinksApple = {
  url: string | URL
  app_store_id?: string | number | undefined
  app_name?: string | undefined
}
export type AppLinksAndroid = {
  package: string
  url?: string | URL | undefined
  class?: string | undefined
  app_name?: string | undefined
}
export type AppLinksWindows = {
  url: string | URL
  app_id?: string | undefined
  app_name?: string | undefined
}
export type AppLinksWeb = {
  url: string | URL
  should_fallback?: boolean | undefined
}

// Apple Itunes APp
// https://developer.apple.com/documentation/webkit/promoting_apps_with_smart_app_banners
export type ItunesApp = {
  appId: string
  appArgument?: string | undefined
}

// Viewport meta structure
// https://developer.mozilla.org/docs/Web/HTML/Viewport_meta_tag
// intentionally leaving out user-scalable, use a string if you want that behavior
export type ViewportLayout = {
  width?: string | number | undefined
  height?: string | number | undefined
  initialScale?: number | undefined
  minimumScale?: number | undefined
  maximumScale?: number | undefined
  userScalable?: boolean | undefined
  viewportFit?: 'auto' | 'cover' | 'contain' | undefined
  interactiveWidget?:
    | 'resizes-visual'
    | 'resizes-content'
    | 'overlays-content'
    | undefined
}

// Apple Web App
// https://developer.apple.com/library/archive/documentation/AppleApplications/Reference/SafariHTMLRef/Articles/MetaTags.html
// https://developer.apple.com/library/archive/documentation/AppleApplications/Reference/SafariWebContent/ConfiguringWebApplications/ConfiguringWebApplications.html
export type AppleWebApp = {
  // default true
  capable?: boolean | undefined
  title?: string | undefined
  startupImage?: AppleImage | Array<AppleImage> | undefined
  // default "default"
  statusBarStyle?: 'default' | 'black' | 'black-translucent' | undefined
}
export type AppleImage = string | AppleImageDescriptor
export type AppleImageDescriptor = {
  url: string
  media?: string | undefined
}

export type ResolvedAppleWebApp = {
  capable: boolean
  title?: string | null | undefined
  startupImage?: AppleImageDescriptor[] | null | undefined
  statusBarStyle?: 'default' | 'black' | 'black-translucent' | undefined
}

export type Facebook = FacebookAppId | FacebookAdmins
export type FacebookAppId = {
  appId: string
  admins?: never | undefined
}
export type FacebookAdmins = {
  appId?: never | undefined
  admins: string | string[]
}
export type ResolvedFacebook = {
  appId?: string | undefined
  admins?: string[] | undefined
}

// Format Detection
// This is a poorly specified metadata export type that is supposed to
// control whether the device attempts to conver text that matches
// certain formats into links for action. The most supported example
// is how mobile devices detect phone numbers and make them into links
// that can initiate a phone call
// https://www.goodemailcode.com/email-code/template.html
export type FormatDetection = {
  telephone?: boolean | undefined
  date?: boolean | undefined
  address?: boolean | undefined
  email?: boolean | undefined
  url?: boolean | undefined
}
