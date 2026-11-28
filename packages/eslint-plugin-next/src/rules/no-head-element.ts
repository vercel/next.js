import path from 'path'
import { defineRule } from '../utils/define-rule'
import { getRootDirs } from '../utils/get-root-dirs'

const url = 'https://nextjs.org/docs/messages/no-head-element'

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
    const filename = path.resolve(context.filename)
    let inAppDir: boolean | undefined

    // Only lint the <head> element in pages directory. The check is relative to
    // the project root, so unrelated `app` directories in the absolute path
    // (e.g. `webapp/` or `/app/`) do not hide the violation.
    const isInAppDir = () => {
      if (inAppDir === undefined) {
        inAppDir = getRootDirs(context).some((rootDir) =>
          [path.join(rootDir, 'app'), path.join(rootDir, 'src', 'app')].some(
            (appDir) =>
              filename.startsWith(`${path.resolve(appDir)}${path.sep}`)
          )
        )
      }

      return inAppDir
    }

    return {
      JSXOpeningElement(node) {
        if (node.name.name !== 'head' || isInAppDir()) {
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
