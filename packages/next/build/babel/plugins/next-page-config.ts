import { join } from 'path'
import { PluginObj } from '@babel/core'
import { NodePath } from '@babel/traverse'
import * as BabelTypes from '@babel/types'
import { PageConfig } from 'next-server/types'

export const inlineGipIdentifier = '__NEXT_GIP_INLINE__'
export const dropBundleIdentifier = '__NEXT_DROP_CLIENT_FILE__'
const sprFetchIdentifier = '__nextSprFetcher'

export const sprPages = new Set()
const configKeys = new Set(['amp', 'experimentalPrerender'])

// replace program path with just a variable with the drop identifier
function replaceBundle(path: any, t: typeof BabelTypes) {
  path.parentPath.replaceWith(
    t.program(
      [
        t.variableDeclaration('const', [
          t.variableDeclarator(
            t.identifier('config'),
            t.assignmentExpression(
              '=',
              t.identifier(dropBundleIdentifier),
              t.stringLiteral(`${dropBundleIdentifier} ${Date.now()}`)
            )
          ),
        ]),
      ],
      []
    )
  )
}

interface ConfigState {
  nextPage?: string
  setupInlining?: boolean
  bundleDropped?: boolean
  setupSprHandler?: boolean
}

export default function nextPageConfig({
  types: t,
}: {
  types: typeof BabelTypes
}): PluginObj {
  return {
    visitor: {
      Program: {
        enter(path, state: ConfigState) {
          path.traverse(
            {
              ExportNamedDeclaration(
                path: NodePath<BabelTypes.ExportNamedDeclaration>,
                state: any
              ) {
                if (
                  state.bundleDropped ||
                  !path.node.declaration ||
                  !(path.node.declaration as any).declarations
                )
                  return
                const { declarations } = path.node.declaration as any
                const config: PageConfig = {}

                for (const declaration of declarations) {
                  if (declaration.id.name !== 'config') continue

                  if (declaration.init.type !== 'ObjectExpression') {
                    const pageName =
                      (state.filename || '').split(state.cwd || '').pop() ||
                      'unknown'

                    throw new Error(
                      `Invalid page config export found. Expected object but got ${
                        declaration.init.type
                      } in file ${pageName}. See: https://err.sh/zeit/next.js/invalid-page-config`
                    )
                  }

                  for (const prop of declaration.init.properties) {
                    const { name } = prop.key
                    if (configKeys.has(name)) {
                      // @ts-ignore
                      config[name] = prop.value.value
                    }
                  }
                }

                if (config.amp === true) {
                  replaceBundle(path, t)
                  state.bundleDropped = true
                  return
                }

                if (
                  config.experimentalPrerender === true ||
                  config.experimentalPrerender === 'inline'
                ) {
                  state.setupInlining = true
                }

                if (config.experimentalPrerender === 'spr') {
                  state.setupSprHandler = true
                  let page = (state.filename || '')
                    .split(join(state.cwd || '', 'pages'))
                    .pop()

                  page = page.replace(/\\/g, '/')
                  page = page.split('.')
                  page.pop()
                  page = page.join('.')

                  page = page.replace(/\/index$/, '') || '/'
                  state.nextPage = page
                  sprPages.add(page)

                  // prepend import for client fetcher to program body
                  ;(path.parentPath.node as any).body.unshift(
                    t.importDeclaration(
                      [
                        t.importDefaultSpecifier(
                          t.identifier(sprFetchIdentifier)
                        ),
                      ],
                      t.stringLiteral('next/dist/client/spr-fetcher')
                    )
                  )
                }
              },
            },
            state
          )
        },
      },
      // handles Page.getInitialProps = () => {}
      AssignmentExpression(path, state: ConfigState) {
        if (!state.setupInlining && !state.setupSprHandler) return
        const { property } = (path.node.left || {}) as any
        const { name } = property
        if (name !== 'getInitialProps') return

        if (state.setupInlining) {
          // replace the getInitialProps function with an identifier for replacing
          path.node.right = t.functionExpression(
            null,
            [],
            t.blockStatement([
              t.returnStatement(t.stringLiteral(inlineGipIdentifier)),
            ])
          )
        }
        if (state.setupSprHandler) {
          path.node.right = t.functionExpression(
            null,
            [],
            t.blockStatement([
              t.returnStatement(
                t.callExpression(t.identifier(sprFetchIdentifier), [
                  t.stringLiteral(state.nextPage!),
                ])
              ),
            ])
          )
        }
      },
      // handles class { static async getInitialProps() {} }
      FunctionDeclaration(path, state: ConfigState) {
        if (!state.setupInlining && !state.setupSprHandler) return
        if ((path.node.id && path.node.id.name) !== 'getInitialProps') return

        if (state.setupInlining) {
          path.node.body = t.blockStatement([
            t.returnStatement(t.stringLiteral(inlineGipIdentifier)),
          ])
        }
        if (state.setupSprHandler) {
          path.node.body = t.blockStatement([
            t.returnStatement(
              t.callExpression(t.identifier(sprFetchIdentifier), [
                t.stringLiteral(state.nextPage!),
              ])
            ),
          ])
        }
      },
      // handles class { static async getInitialProps() {} }
      ClassMethod(path, state: ConfigState) {
        if (!state.setupInlining) return
        if (
          (path.node.key && (path.node.key as BabelTypes.Identifier).name) !==
          'getInitialProps'
        )
          return

        path.node.body = t.blockStatement([
          t.returnStatement(t.stringLiteral(inlineGipIdentifier)),
        ])
      },
    },
  }
}
