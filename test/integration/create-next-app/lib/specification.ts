import path from 'path'
import {
  SRC_DIR_NAMES,
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
      files: [
        'pages/index.js',
        'pages/_app.js',
        'pages/api/hello.js',
        'jsconfig.json',
      ],
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
  'default-tw': {
    js: {
      files: [
        'jsconfig.json',
        'pages/_app.js',
        'pages/api/hello.js',
        'pages/index.js',
        'postcss.config.js',
        'tailwind.config.js',
      ],
      deps: [],
      devDeps: ['postcss', 'tailwindcss'],
    },
    ts: {
      files: [
        'next-env.d.ts',
        'pages/_app.tsx',
        'pages/api/hello.ts',
        'pages/index.tsx',
        'postcss.config.js',
        'tailwind.config.ts',
        'tsconfig.json',
      ],
      deps: [],
      devDeps: [
        '@types/node',
        '@types/react-dom',
        '@types/react',
        'postcss',
        'tailwindcss',
        'typescript',
      ],
    },
  },
  app: {
    js: {
      deps: [],
      devDeps: [],
      files: ['app/page.js', 'app/layout.js', 'jsconfig.json'],
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
        'tsconfig.json',
        'next-env.d.ts',
      ],
    },
  },
  'app-tw': {
    js: {
      deps: [],
      devDeps: ['postcss', 'tailwindcss'],
      files: [
        'app/layout.js',
        'app/page.js',
        'jsconfig.json',
        'postcss.config.js',
        'tailwind.config.js',
      ],
    },
    ts: {
      deps: [],
      devDeps: [
        '@types/node',
        '@types/react-dom',
        '@types/react',
        'postcss',
        'tailwindcss',
        'typescript',
      ],
      files: [
        'app/layout.tsx',
        'app/page.tsx',
        'next-env.d.ts',
        'postcss.config.js',
        'tailwind.config.ts',
        'tsconfig.json',
      ],
    },
  },
}

export type GetProjectSettingsArgs = {
  template: TemplateType
  mode: TemplateMode
  setting: keyof ProjectSettings
  srcDir?: boolean
}

export const mapSrcFiles = (files: string[], srcDir?: boolean) =>
  files.map((file) =>
    srcDir && SRC_DIR_NAMES.some((name) => file.startsWith(name))
      ? path.join('src', file)
      : file
  )

export const getProjectSetting = ({
  template,
  mode,
  setting,
  srcDir,
}: GetProjectSettingsArgs) => {
  return [
    ...projectSpecification.global[setting],
    ...mapSrcFiles(projectSpecification[template][mode][setting], srcDir),
  ]
}
