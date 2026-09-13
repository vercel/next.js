/**
 * `<Image>` is declared with an explicit `ForwardRefExoticComponent<ImageProps & ...>`
 * annotation. Without it, declaration emit expands `ImageProps` inline and drops the
 * JSDoc of every member, so `@deprecated` tags never reach editors at the call site.
 *
 * See https://github.com/vercel/next.js/pull/<pr>
 */
import path from 'path'
import os from 'os'
import fs from 'fs'
import ts from 'typescript'

const DEPRECATED_PROPS = [
  'priority',
  'onLoadingComplete',
  'layout',
  'objectFit',
  'objectPosition',
  'lazyBoundary',
  'lazyRoot',
]

function getJsDocTagsForImageProps(): Map<string, string[]> {
  const nextDir = path.join(__dirname, '../../packages/next')
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'next-image-types-'))
  const fixture = path.join(dir, 'use-image.tsx')

  fs.writeFileSync(
    fixture,
    `import Image from '${path.join(nextDir, 'image')}'\n` +
      `export const El = () => <Image src="/a.png" alt="" ${DEPRECATED_PROPS.map(
        (p) => `${p}={undefined as any}`
      ).join(' ')} />\n`
  )

  const program = ts.createProgram([fixture], {
    jsx: ts.JsxEmit.ReactJSX,
    lib: ['lib.es2020.d.ts', 'lib.dom.d.ts'],
    moduleResolution: ts.ModuleResolutionKind.Bundler,
    module: ts.ModuleKind.ESNext,
    target: ts.ScriptTarget.ES2020,
    skipLibCheck: true,
    strict: true,
    esModuleInterop: true,
  })

  const sourceFile = program.getSourceFile(fixture)!
  const checker = program.getTypeChecker()
  const found = new Map<string, string[]>()

  const visit = (node: ts.Node) => {
    if (ts.isJsxAttribute(node)) {
      const name = node.name.getText()
      const contextualType = checker.getContextualType(
        node.parent as ts.JsxAttributes
      )
      const symbol = contextualType?.getProperty(name)
      if (symbol) {
        found.set(
          name,
          symbol.getJsDocTags(checker).map((tag) => tag.name)
        )
      }
    }
    node.forEachChild(visit)
  }
  visit(sourceFile)

  fs.rmSync(dir, { recursive: true, force: true })
  return found
}

describe('next/image deprecated props', () => {
  const tags = getJsDocTagsForImageProps()

  it.each(DEPRECATED_PROPS)(
    'surfaces the @deprecated tag for `%s` at the call site',
    (prop) => {
      expect(tags.get(prop)).toContain('deprecated')
    }
  )

  it('resolves every prop through the emitted declaration', () => {
    for (const prop of DEPRECATED_PROPS) {
      expect(tags.has(prop)).toBe(true)
    }
  })
})
