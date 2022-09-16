import { getPageStaticInfo } from '../../analysis/get-page-static-info'

export const defaultJsFileExtensions = ['js', 'mjs', 'jsx', 'ts', 'tsx']
const imageExtensions = ['jpg', 'jpeg', 'png', 'webp', 'avif']
const nextClientComponents = [
  'dist/client/link',
  'dist/client/image',
  'dist/client/future/image',
  'dist/shared/lib/head',
  'dist/client/script',
  'dist/shared/lib/dynamic',
]

export function buildExports(moduleExports: any, isESM: boolean) {
  let ret = ''
  Object.keys(moduleExports).forEach((key) => {
    const exportExpression = isESM
      ? `export ${key === 'default' ? key : `const ${key} =`} ${
          moduleExports[key]
        }`
      : `exports.${key} = ${moduleExports[key]}`

    ret += exportExpression + '\n'
  })
  return ret
}

// Special cases for Next.js APIs that are considered as client components:
// - .client.[ext]
// - next built-in client components
// - .[imageExt]
export const clientComponentRegex = new RegExp(
  '(' +
    `\\.client(\\.(${defaultJsFileExtensions.join('|')}))?|` +
    `next[\\\\/](${nextClientComponents.join('|')})(\\.js)?|` +
    `\\.(${imageExtensions.join('|')})` +
    ')$'
)

export const serverComponentRegex = new RegExp(
  `\\.server(\\.(${defaultJsFileExtensions.join('|')}))?$`
)

export async function loadEdgeFunctionConfigFromFile(
  absolutePagePath: string,
  resolve: (context: string, request: string) => Promise<string>
) {
  const pageFilePath = await resolve('/', absolutePagePath)
  return (
    await getPageStaticInfo({
      nextConfig: {},
      pageFilePath,
      isDev: false,
    })
  ).middleware
}
