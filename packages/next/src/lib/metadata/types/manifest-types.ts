type ClientModeEnum = 'auto' | 'focus-existing' | 'navigate-existing' | 'navigate-new'

type File = {
  name: string
  accept: string | string[]
}

type Icon = {
  src: string
  type?: string
  sizes?: string
  purpose?: 'any' | 'maskable' | 'monochrome'
}

export type Manifest = {
  background_color?: string
  categories?: string[]
  description?: string
  dir?: 'ltr' | 'rtl' | 'auto'
  display?: 'fullscreen' | 'standalone' | 'minimal-ui' | 'browser'
  display_override?: (
    | 'fullscreen'
    | 'standalone'
    | 'minimal-ui'
    | 'browser'
    | 'window-controls-overlay'
  )[]
  file_handlers?: {
    action: string
    accept: {
      [mimeType: string]: string[]
    }
  }[]
  icons?: Icon[]
  id?: string
  lang?: string
  launch_handler?: {
    client_mode?: ClientModeEnum | ClientModeEnum[]
  }
  name?: string
  orientation?:
    | 'any'
    | 'natural'
    | 'landscape'
    | 'portrait'
    | 'portrait-primary'
    | 'portrait-secondary'
    | 'landscape-primary'
    | 'landscape-secondary'
  prefer_related_applications?: boolean
  protocol_handlers?: {
    protocol: string
    url: string
  }[]
  related_applications?: {
    platform: string
    url: string
    id?: string
  }[]
  scope?: string
  screenshots?: {
    form_factor?: 'narrow' | 'wide'
    label?: string
    platform?: 
      | 'android'
      | 'chromeos'
      | 'ipados'
      | 'ios'
      | 'kaios'
      | 'macos'
      | 'windows'
      | 'xbox'
      | 'chrome_web_store'
      | 'itunes'
      | 'microsoft-inbox'
      | 'microsoft-store'
      | 'play'
    src: string
    type?: string
    sizes?: string
  }[]
  serviceworker?: {
    src?: string
    scope?: string
    type?: string
    update_via_cache?: 'import' | 'none' | 'all'
  }
  share_target?: {
    action?: string
    method?: 'get' | 'post'
    enctype?:
      | 'application/x-www-form-urlencoded'
      | 'multipart/form-data'
      | 'text/plain'
    params?: {
      title?: string
      text?: string
      url?: string
      files?: File | File[]
    }
  }
  short_name?: string
  shortcuts?: {
    name: string
    short_name?: string
    description?: string
    url: string
    icons?: Icon[]
  }[]
  start_url?: string
  theme_color?: string
}
