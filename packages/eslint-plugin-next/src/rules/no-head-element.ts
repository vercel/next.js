import path from 'path'
import { defineRule } from '../utils/define-rule'
import { getRootDirs } from '../utils/get-root-dirs'

const url = 'https://nextjs.org/docs/messages/no-head-element'

const isFileInAppDir = (
  filename: string,
  cwd: string,
  rootDirs: string[]
): boolean => {
  const resolvedFile = path.resolve(cwd, filename)

  return rootDirs.some((rootDir) => {
    const resolvedRoot = path.resolve(cwd, rootDir)
    const relativePath = path.relative(resolvedRoot, resolvedFile)

    if (
      !relativePath ||
      relativePath.startsWith('..') ||
      path.isAbsolute(relativePath)
    ) {
      return false
    }

    const segments = relativePath.split(/[\\/]/).filter(Boolean)
    return (
      segments[0] === 'app' ||
      (segments[0] === 'src' && segments[1] === 'app')
    )
  })
}

export default defineRule({
  meta: {
    docs: {
      description: 'Prevent usage of `<head>` element.',
      category: 'HTML',
      recommended: true,
      url,
    },
    type: 'problem',
    schema: [],
  },
  create(context) {
    const rootDirs = getRootDirs(context)

    // Only lint the <head> element in pages directory
    if (isFileInAppDir(context.filename, context.cwd, rootDirs)) {
      return {}
    }

    return {
      JSXOpeningElement(node) {
        if (node.name.name !== 'head') {
          return
        }

        context.report({
          node,
          message: `Do not use \`<head>\` element. Use \`<Head />\` from \`next/head\` instead. See: ${url}`,
        })
      },
    }
  },
})
