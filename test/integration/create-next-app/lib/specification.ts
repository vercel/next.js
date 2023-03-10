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
