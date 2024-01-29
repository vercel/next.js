// When rendering applink meta tags add a namespace tag before each array instance
// if more than one member exists.
// ref: https://developers.facebook.com/docs/applinks/metadata-reference

export type AppLinks = {
  ios?: AppLinksApple | Array<AppLinksApple>
  iphone?: AppLinksApple | Array<AppLinksApple>
  ipad?: AppLinksApple | Array<AppLinksApple>
  android?: AppLinksAndroid | Array<AppLinksAndroid>
  windows_phone?: AppLinksWindows | Array<AppLinksWindows>
  windows?: AppLinksWindows | Array<AppLinksWindows>
  windows_universal?: AppLinksWindows | Array<AppLinksWindows>
  web?: AppLinksWeb | Array<AppLinksWeb>
}
export type ResolvedAppLinks = {
  ios?: Array<AppLinksApple>
  iphone?: Array<AppLinksApple>
  ipad?: Array<AppLinksApple>
  android?: Array<AppLinksAndroid>
  windows_phone?: Array<AppLinksWindows>
  windows?: Array<AppLinksWindows>
  windows_universal?: Array<AppLinksWindows>
  web?: Array<AppLinksWeb>
}
export type AppLinksApple = {
  url: string | URL
  app_store_id?: string | number
  app_name?: string
}
export type AppLinksAndroid = {
  package: string
  url?: string | URL
  class?: string
  app_name?: string
}
export type AppLinksWindows = {
  url: string | URL
  app_id?: string
  app_name?: string
}
export type AppLinksWeb = {
  url: string | URL
  should_fallback?: boolean
}

// Apple Itunes APp
// https://developer.apple.com/documentation/webkit/promoting_apps_with_smart_app_banners
export type ItunesApp = {
  appId: string
  appArgument?: string
}

// Viewport meta structure
// https://developer.mozilla.org/docs/Web/HTML/Viewport_meta_tag
// intentionally leaving out user-scalable, use a string if you want that behavior
export type ViewportLayout = {
  width?: string | number
  height?: string | number
  initialScale?: number
  minimumScale?: number
  maximumScale?: number
  userScalable?: boolean
  viewportFit?: 'auto' | 'cover' | 'contain'
  interactiveWidget?: 'resizes-visual' | 'resizes-content' | 'overlays-content'
}

// Apple Web App
// https://developer.apple.com/library/archive/documentation/AppleApplications/Reference/SafariHTMLRef/Articles/MetaTags.html
// https://developer.apple.com/library/archive/documentation/AppleApplications/Reference/SafariWebContent/ConfiguringWebApplications/ConfiguringWebApplications.html
export type AppleWebApp = {
  // default true
  capable?: boolean
  title?: string
  startupImage?: AppleImage | Array<AppleImage>
  // default "default"
  statusBarStyle?: 'default' | 'black' | 'black-translucent'
}
export type AppleImage = string | AppleImageDescriptor
export type AppleImageDescriptor = {
  url: string
  media?: string
}

export type ResolvedAppleWebApp = {
  capable: boolean
  title?: string | null
  startupImage?: AppleImageDescriptor[] | null
  statusBarStyle?: 'default' | 'black' | 'black-translucent'
}

// Format Detection
// This is a poorly specified metadata export type that is supposed to
// control whether the device attempts to conver text that matches
// certain formats into links for action. The most supported example
// is how mobile devices detect phone numbers and make them into links
// that can initiate a phone call
// https://www.goodemailcode.com/email-code/template.html
export type FormatDetection = {
  telephone?: boolean
  date?: boolean
  address?: boolean
  email?: boolean
  url?: boolean
}
