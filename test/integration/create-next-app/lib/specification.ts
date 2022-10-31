import {
  TemplateMode,
  TemplateType,
} from '../../../../packages/create-next-app/templates'

export type ProjectSettings = {
  files: string[]
  deps: string[]
  devDeps: string[]
}

export type ProjectSpecification = {
  global: ProjectSettings
} & {
  [key in TemplateType]: {
    [key in TemplateMode]: ProjectSettings
  }
}

/**
 * Required files for a given project template and mode.
 */
export const projectSpecification: ProjectSpecification = {
  global: {
    files: [
      'package.json',
      '.eslintrc.json',
      'node_modules/next',
      '.gitignore',
    ],
    deps: ['next', 'react', 'react-dom'],
    devDeps: ['eslint', 'eslint-config-next'],
  },
  default: {
    js: {
      files: ['pages/index.js', 'pages/_app.js', 'pages/api/hello.js'],
      deps: [],
      devDeps: [],
    },
    ts: {
      files: [
        'pages/index.tsx',
        'pages/_app.tsx',
        'pages/api/hello.ts',
        'tsconfig.json',
        'next-env.d.ts',
      ],
      deps: [],
      devDeps: [
        '@types/node',
        '@types/react',
        '@types/react-dom',
        'typescript',
      ],
    },
  },
  app: {
    js: {
      deps: [],
      devDeps: [],
      files: ['app/page.jsx', 'app/layout.jsx', 'pages/api/hello.js'],
    },
    ts: {
      deps: [],
      devDeps: [
        '@types/node',
        '@types/react',
        '@types/react-dom',
        'typescript',
      ],
      files: [
        'app/page.tsx',
        'app/layout.tsx',
        'pages/api/hello.ts',
        'tsconfig.json',
        'next-env.d.ts',
      ],
    },
  },
}

export type GetProjectSettingsArgs = {
  template: TemplateType
  mode: TemplateMode
  setting: keyof ProjectSettings
}

export const getProjectSetting = ({
  template,
  mode,
  setting,
}: GetProjectSettingsArgs) => {
  return [
    ...projectSpecification.global[setting],
    ...projectSpecification[template][mode][setting],
  ]
}
