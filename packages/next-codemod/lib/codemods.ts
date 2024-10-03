type Codemod = {
  title: string
  value: string
}

type VersionCodemods = {
  version: string
  codemods: Codemod[]
}

export const availableCodemods: VersionCodemods[] = [
  {
    version: '6',
    codemods: [
      {
        title: 'Use withRouter',
        value: 'url-to-withrouter',
      },
    ],
  },
  {
    version: '8',
    codemods: [
      {
        title: 'Transform AMP HOC into page config',
        value: 'withamp-to-config',
      },
    ],
  },
  {
    version: '9',
    codemods: [
      {
        title: 'Transform Anonymous Components into Named Components',
        value: 'name-default-component',
      },
    ],
  },
  {
    version: '10',
    codemods: [
      {
        title: 'Add React Import',
        value: 'add-missing-react-import',
      },
    ],
  },
  {
    version: '11',
    codemods: [
      {
        title: 'Migrate from CRA',
        value: 'cra-to-next',
      },
    ],
  },
  {
    version: '13.0',
    codemods: [
      {
        title: 'Remove <a> Tags From Link Components',
        value: 'new-link',
      },
      {
        title: 'Migrate to the New Image Component',
        value: 'next-image-experimental',
      },
      {
        title: 'Rename Next Image Imports',
        value: 'next-image-to-legacy-image',
      },
    ],
  },
  {
    version: '13.2',
    codemods: [
      {
        title: 'Use Built-in Font',
        value: 'built-in-next-font',
      },
    ],
  },
  {
    version: '14.0',
    codemods: [
      {
        title: 'Migrate ImageResponse imports',
        value: 'next-og-import',
      },
      {
        title: 'Use viewport export',
        value: 'metadata-to-viewport-export',
      },
    ],
  },
  {
    version: '15.0.0-canary.153',
    codemods: [
      {
        title: 'Migrate `geo` and `ip` properties on `NextRequest`',
        value: 'next-request-geo-ip',
      },
    ],
  },
  {
    version: '15.0.0-canary.171',
    codemods: [
      {
        title: 'Transforms usage of Next.js async Request APIs',
        value: 'next-async-request-api',
      },
    ],
  },
]
