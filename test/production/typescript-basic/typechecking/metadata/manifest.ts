import type { MetadataRoute } from 'next'
// eslint-disable-next-line @typescript-eslint/no-unused-expressions
;() => {
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
  }) satisfies MetadataRoute.Manifest
  ;({
    icons: [
      {
        src: '',
        type: undefined,
        sizes: undefined,
        purpose: undefined,
      },
    ],
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
  }) satisfies MetadataRoute.Manifest
}
