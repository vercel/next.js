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
  app: {
    js: {
      deps: [],
      devDeps: [],
      files: ['app/page.js', 'app/layout.js', 'jsconfig.json'],
    },
    ts: {
      deps: ['@types/node', '@types/react', '@types/react-dom', 'typescript'],
      devDeps: [],
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
      deps: ['autoprefixer', 'postcss', 'tailwindcss'],
      devDeps: [],
      files: [
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
