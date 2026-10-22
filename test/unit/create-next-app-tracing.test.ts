import { mkdtemp, readFile, rm } from 'fs/promises'
import os from 'os'
import path from 'path'
import { TRACING_PACKAGES } from 'next/dist/build/builtin-instrumentation'
import {
  Bundler,
  installTemplate,
  type TemplateMode,
  type TemplateType,
} from '../../packages/create-next-app/templates'

const TEMPLATES: TemplateType[] = [
  'app',
  'app-api',
  'app-empty',
  'app-tw',
  'app-tw-empty',
  'default',
  'default-empty',
  'default-tw',
  'default-tw-empty',
]
const MODES: TemplateMode[] = ['ts', 'js']

describe('create-next-app tracing', () => {
  let root: string

  beforeEach(async () => {
    root = await mkdtemp(path.join(os.tmpdir(), 'cna-tracing-'))
    jest.spyOn(console, 'log').mockImplementation(() => {})
  })

  afterEach(async () => {
    jest.restoreAllMocks()
    await rm(root, { recursive: true, force: true })
  })

  describe.each(TEMPLATES)('%s', (template) => {
    it.each(MODES)(
      'enables tracing and installs TRACING_PACKAGES (%s)',
      async (mode) => {
        await installTemplate({
          appName: 'tracing-app',
          root,
          packageManager: 'npm',
          isOnline: false,
          template,
          mode,
          eslint: false,
          biome: false,
          tailwind: template.includes('-tw'),
          srcDir: false,
          importAlias: '@/*',
          skipInstall: true,
          bundler: Bundler.Turbopack,
          reactCompiler: false,
          cacheComponents: true,
          agentFeedback: false,
        })

        const config = await readFile(
          path.join(root, mode === 'js' ? 'next.config.mjs' : 'next.config.ts'),
          'utf8'
        )
        expect(config).toContain(
          '  /* config options here */\n  tracing: true,\n'
        )

        const { dependencies } = JSON.parse(
          await readFile(path.join(root, 'package.json'), 'utf8')
        )
        const tracingDependencies = Object.keys(dependencies).filter(
          (name) =>
            name.startsWith('@opentelemetry/') || name.startsWith('@vercel/')
        )
        expect(tracingDependencies.sort()).toEqual([...TRACING_PACKAGES].sort())
      }
    )
  })
})
