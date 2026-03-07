import { mkdtemp, mkdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'

import { requireMarkdownComponents } from './require-markdown-components'

describe('requireMarkdownComponents', () => {
  it('resolves markdown-components from the configured project dir', async () => {
    const tmpDir = await mkdtemp(join(tmpdir(), 'nextjs-markdown-components-'))
    const appDir = join(tmpDir, 'apps', 'web')

    await mkdir(appDir, { recursive: true })
    await writeFile(
      join(tmpDir, 'markdown-components.ts'),
      createMarkdownComponentsModule('root')
    )
    await writeFile(
      join(appDir, 'markdown-components.ts'),
      createMarkdownComponentsModule('app')
    )

    const components = await requireMarkdownComponents({
      dir: appDir,
      dev: false,
    })

    expect(components.p?.(createMarkdownComponentContext('value'))).toBe(
      'app:value'
    )
  })

  it('resolves markdown-components imports through configured tsconfig paths', async () => {
    const tmpDir = await mkdtemp(join(tmpdir(), 'nextjs-markdown-components-'))
    const srcDir = join(tmpDir, 'src')

    await mkdir(srcDir, { recursive: true })
    await writeFile(
      join(tmpDir, 'jsconfig.json'),
      JSON.stringify({
        compilerOptions: {
          baseUrl: '.',
          paths: {
            '@/*': ['src/*'],
          },
        },
      })
    )
    await writeFile(join(srcDir, 'label.ts'), `export const label = 'alias'\n`)
    await writeFile(
      join(tmpDir, 'markdown-components.ts'),
      `
        import { label } from '@/label'

        export function useMarkdownComponents() {
          return {
            p({ children }) {
              return \`\${label}:\${children}\`
            },
          }
        }
      `
    )

    const components = await requireMarkdownComponents({
      dir: tmpDir,
      dev: false,
    })

    expect(components.p?.(createMarkdownComponentContext('value'))).toBe(
      'alias:value'
    )
  })

  it('reloads markdown-components from disk on every request in development', async () => {
    const tmpDir = await mkdtemp(join(tmpdir(), 'nextjs-markdown-components-'))
    const filePath = join(tmpDir, 'markdown-components.ts')

    await writeFile(filePath, createMarkdownComponentsModule('first'))

    const firstLoad = await requireMarkdownComponents({
      dir: tmpDir,
      dev: true,
    })
    expect(firstLoad.p?.(createMarkdownComponentContext('value'))).toBe(
      'first:value'
    )

    await writeFile(filePath, createMarkdownComponentsModule('second'))

    const secondLoad = await requireMarkdownComponents({
      dir: tmpDir,
      dev: true,
    })
    expect(secondLoad.p?.(createMarkdownComponentContext('value'))).toBe(
      'second:value'
    )
  })
})

function createMarkdownComponentsModule(prefix: string): string {
  return `
    export function useMarkdownComponents() {
      return {
        p({ children }) {
          return '${prefix}:' + children
        },
      }
    }
  `
}

function createMarkdownComponentContext(children: string) {
  return {
    attributes: {},
    children,
    textContent: children,
    renderDefault() {
      return children
    },
  }
}
