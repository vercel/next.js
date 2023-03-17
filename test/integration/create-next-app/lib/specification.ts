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
    deps: ['next', 'react', 'react-dom', 'eslint', 'eslint-config-next'],
    devDeps: [],
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
      deps: ['@types/node', '@types/react', '@types/react-dom', 'typescript'],
      devDeps: [],
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
      deps: ['autoprefixer', 'postcss', 'tailwindcss'],
      devDeps: [],
    },
    ts: {
      files: [
        'next-env.d.ts',
        'pages/_app.tsx',
        'pages/api/hello.ts',
        'pages/index.tsx',
        'postcss.config.js',
        'tailwind.config.js',
        'tsconfig.json',
      ],
      deps: [
        '@types/node',
        '@types/react-dom',
        '@types/react',
        'autoprefixer',
        'postcss',
        'tailwindcss',
        'typescript',
      ],
      devDeps: [],
    },
  },
  app: {
    js: {
      deps: [],
      devDeps: [],
      files: [
        'app/page.js',
        'app/layout.js',
        'app/api/hello/route.js',
        'jsconfig.json',
      ],
    },
    ts: {
      deps: ['@types/node', '@types/react', '@types/react-dom', 'typescript'],
      devDeps: [],
      files: [
        'app/page.tsx',
        'app/layout.tsx',
        'app/api/hello/route.ts',
        'tsconfig.json',
        'next-env.d.ts',
      ],
    },
  },
  'app-tw': {
    js: {
      deps: ['autoprefixer', 'postcss', 'tailwindcss'],
      devDeps: [],
      files: [
        'app/api/hello/route.js',
        'app/layout.js',
        'app/page.js',
        'jsconfig.json',
        'postcss.config.js',
        'tailwind.config.js',
      ],
    },
    ts: {
      deps: [
        '@types/node',
        '@types/react-dom',
        '@types/react',
        'autoprefixer',
        'postcss',
        'tailwindcss',
        'typescript',
      ],
      devDeps: [],
      files: [
        'app/api/hello/route.ts',
        'app/layout.tsx',
        'app/page.tsx',
        'next-env.d.ts',
        'postcss.config.js',
        'tailwind.config.js',
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
