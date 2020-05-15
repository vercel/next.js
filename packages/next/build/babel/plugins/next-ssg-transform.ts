import { NodePath, PluginObj, types as BabelTypes } from '@babel/core'
import { SERVER_PROPS_SSG_CONFLICT } from '../../../lib/constants'
import {
  STATIC_PROPS_ID,
  SERVER_PROPS_ID,
} from '../../../next-server/lib/constants'

export const EXPORT_NAME_GET_STATIC_PROPS = 'getStaticProps'
export const EXPORT_NAME_GET_STATIC_PATHS = 'getStaticPaths'
export const EXPORT_NAME_GET_SERVER_PROPS = 'getServerSideProps'

const ssgExports = new Set([
  EXPORT_NAME_GET_STATIC_PROPS,
  EXPORT_NAME_GET_STATIC_PATHS,
  EXPORT_NAME_GET_SERVER_PROPS,

  // legacy methods added so build doesn't fail from importing
  // server-side only methods
  `unstable_getStaticProps`,
  `unstable_getStaticPaths`,
  `unstable_getServerProps`,
  `unstable_getServerSideProps`,
])

type PluginState = {
  refs: Set<NodePath<BabelTypes.Identifier>>
  isPrerender: boolean
  isServerProps: boolean
  done: boolean
}

function decorateSsgExport(
  t: typeof BabelTypes,
  path: NodePath<BabelTypes.Program>,
  state: PluginState
) {
  const gsspName = state.isPrerender ? STATIC_PROPS_ID : SERVER_PROPS_ID
  const gsspId = t.identifier(gsspName)

  const addGsspExport = (
    path: NodePath<
      BabelTypes.ExportDefaultDeclaration | BabelTypes.ExportNamedDeclaration
    >
  ) => {
    if (state.done) {
      return
    }
    state.done = true

    // @ts-ignore invalid return type
    const [pageCompPath] = path.replaceWithMultiple([
      t.exportNamedDeclaration(
        t.variableDeclaration(
          // We use 'var' instead of 'let' or 'const' for ES5 support. Since
          // this runs in `Program#exit`, no ES2015 transforms (preset env)
          // will be ran against this code.
          'var',
          [t.variableDeclarator(gsspId, t.booleanLiteral(true))]
        ),
        [t.exportSpecifier(gsspId, gsspId)]
      ),
      path.node,
    ])
    path.scope.registerDeclaration(pageCompPath)
  }

  path.traverse({
    ExportDefaultDeclaration(path) {
      addGsspExport(path)
    },
    ExportNamedDeclaration(path) {
      addGsspExport(path)
    },
  })
}

const isDataIdentifier = (name: string, state: PluginState): boolean => {
  if (ssgExports.has(name)) {
    if (name === EXPORT_NAME_GET_SERVER_PROPS) {
      if (state.isPrerender) {
        throw new Error(SERVER_PROPS_SSG_CONFLICT)
      }
      state.isServerProps = true
    } else {
      if (state.isServerProps) {
        throw new Error(SERVER_PROPS_SSG_CONFLICT)
      }
      state.isPrerender = true
    }
    return true
  }
  return false
}

export default function nextTransformSsg({
  types: t,
}: {
  types: typeof BabelTypes
}): PluginObj<PluginState> {
  function getIdentifier(
    path: NodePath<
      | BabelTypes.FunctionDeclaration
      | BabelTypes.FunctionExpression
      | BabelTypes.ArrowFunctionExpression
    >
  ): NodePath<BabelTypes.Identifier> | null {
    const parentPath = path.parentPath
    if (parentPath.type === 'VariableDeclarator') {
      const pp = parentPath as NodePath<BabelTypes.VariableDeclarator>
      const name = pp.get('id')
      return name.node.type === 'Identifier'
        ? (name as NodePath<BabelTypes.Identifier>)
        : null
    }

    if (parentPath.type === 'AssignmentExpression') {
      const pp = parentPath as NodePath<BabelTypes.AssignmentExpression>
      const name = pp.get('left')
      return name.node.type === 'Identifier'
        ? (name as NodePath<BabelTypes.Identifier>)
        : null
    }

    if (path.node.type === 'ArrowFunctionExpression') {
      return null
    }

    return path.node.id && path.node.id.type === 'Identifier'
      ? (path.get('id') as NodePath<BabelTypes.Identifier>)
      : null
  }

  function isIdentifierReferenced(
    ident: NodePath<BabelTypes.Identifier>
  ): boolean {
    const b = ident.scope.getBinding(ident.node.name)
    return b != null && b.referenced
  }

  function markFunction(
    path: NodePath<
      | BabelTypes.FunctionDeclaration
      | BabelTypes.FunctionExpression
      | BabelTypes.ArrowFunctionExpression
    >,
    state: PluginState
  ) {
    const ident = getIdentifier(path)
    if (ident?.node && isIdentifierReferenced(ident)) {
      state.refs.add(ident)
    }
  }

  function markImport(
    path: NodePath<
      | BabelTypes.ImportSpecifier
      | BabelTypes.ImportDefaultSpecifier
      | BabelTypes.ImportNamespaceSpecifier
    >,
    state: PluginState
  ) {
    const local = path.get('local')
    if (isIdentifierReferenced(local)) {
      state.refs.add(local)
    }
  }

  return {
    visitor: {
      Program: {
        enter(path, state) {
          state.refs = new Set<NodePath<BabelTypes.Identifier>>()
          state.isPrerender = false
          state.isServerProps = false
          state.done = false

          path.traverse(
            {
              VariableDeclarator(path, state) {
                if (path.node.id.type !== 'Identifier') {
                  return
                }

                const local = path.get('id') as NodePath<BabelTypes.Identifier>
                if (isIdentifierReferenced(local)) {
                  state.refs.add(local)
                }
              },
              FunctionDeclaration: markFunction,
              FunctionExpression: markFunction,
              ArrowFunctionExpression: markFunction,
              ImportSpecifier: markImport,
              ImportDefaultSpecifier: markImport,
              ImportNamespaceSpecifier: markImport,
              ExportNamedDeclaration(path, state) {
                const specifiers = path.get('specifiers')
                if (specifiers.length) {
                  specifiers.forEach(s => {
                    if (isDataIdentifier(s.node.exported.name, state)) {
                      s.remove()
                    }
                  })

                  if (path.node.specifiers.length < 1) {
                    path.remove()
                  }
                  return
                }

                const decl = path.get('declaration') as NodePath<
                  | BabelTypes.FunctionDeclaration
                  | BabelTypes.VariableDeclaration
                >
                if (decl == null || decl.node == null) {
                  return
                }

                switch (decl.node.type) {
                  case 'FunctionDeclaration': {
                    const name = decl.node.id!.name
                    if (isDataIdentifier(name, state)) {
                      path.remove()
                    }
                    break
                  }
                  case 'VariableDeclaration': {
                    const inner = decl.get('declarations') as NodePath<
                      BabelTypes.VariableDeclarator
                    >[]
                    inner.forEach(d => {
                      if (d.node.id.type !== 'Identifier') {
                        return
                      }
                      const name = d.node.id.name
                      if (isDataIdentifier(name, state)) {
                        d.remove()
                      }
                    })
                    break
                  }
                  default: {
                    break
                  }
                }
              },
            },
            state
          )

          if (!state.isPrerender && !state.isServerProps) {
            return
          }

          const refs = state.refs
          let count: number

          function sweepFunction(
            path: NodePath<
              | BabelTypes.FunctionDeclaration
              | BabelTypes.FunctionExpression
              | BabelTypes.ArrowFunctionExpression
            >
          ) {
            const ident = getIdentifier(path)
            if (
              ident?.node &&
              refs.has(ident) &&
              !isIdentifierReferenced(ident)
            ) {
              ++count

              if (
                t.isAssignmentExpression(path.parentPath) ||
                t.isVariableDeclarator(path.parentPath)
              ) {
                path.parentPath.remove()
              } else {
                path.remove()
              }
            }
          }

          function sweepImport(
            path: NodePath<
              | BabelTypes.ImportSpecifier
              | BabelTypes.ImportDefaultSpecifier
              | BabelTypes.ImportNamespaceSpecifier
            >
          ) {
            const local = path.get('local')
            if (refs.has(local) && !isIdentifierReferenced(local)) {
              ++count
              path.remove()
              if (
                (path.parent as BabelTypes.ImportDeclaration).specifiers
                  .length === 0
              ) {
                path.parentPath.remove()
              }
            }
          }

          do {
            ;(path.scope as any).crawl()
            count = 0

            path.traverse({
              // eslint-disable-next-line no-loop-func
              VariableDeclarator(path) {
                if (path.node.id.type !== 'Identifier') {
                  return
                }

                const local = path.get('id') as NodePath<BabelTypes.Identifier>
                if (refs.has(local) && !isIdentifierReferenced(local)) {
                  ++count
                  path.remove()
                }
              },
              FunctionDeclaration: sweepFunction,
              FunctionExpression: sweepFunction,
              ArrowFunctionExpression: sweepFunction,
              ImportSpecifier: sweepImport,
              ImportDefaultSpecifier: sweepImport,
              ImportNamespaceSpecifier: sweepImport,
            })
          } while (count)

          decorateSsgExport(t, path, state)
        },
      },
    },
  }
}
