import { NodePath, PluginObj } from '@babel/core'
import * as BabelTypes from '@babel/types'

const pageComponentVar = '__NEXT_COMP'
const prerenderId = '__NEXT_SPR'

export const EXPORT_NAME_GET_STATIC_PROPS = 'unstable_getStaticProps'
export const EXPORT_NAME_GET_STATIC_PATHS = 'unstable_getStaticPaths'

const ssgExports = new Set([
  EXPORT_NAME_GET_STATIC_PROPS,
  EXPORT_NAME_GET_STATIC_PATHS,
])

type PluginState = { refs: Set<any>; isPrerender: boolean; done: boolean }

function decorateSsgExport(
  t: typeof BabelTypes,
  path: NodePath<BabelTypes.Program>,
  state: PluginState
) {
  path.traverse({
    ExportDefaultDeclaration(path) {
      if (state.done) {
        return
      }
      state.done = true

      const prev = path.node.declaration
      if (prev.type.endsWith('Declaration')) {
        prev.type = prev.type.replace(/Declaration$/, 'Expression') as any
      }

      // @ts-ignore invalid return type
      const [pageCompPath] = path.replaceWithMultiple([
        t.variableDeclaration('const', [
          t.variableDeclarator(t.identifier(pageComponentVar), prev as any),
        ]),
        t.assignmentExpression(
          '=',
          t.memberExpression(
            t.identifier(pageComponentVar),
            t.identifier(prerenderId)
          ),
          t.booleanLiteral(true)
        ),
        t.exportDefaultDeclaration(t.identifier(pageComponentVar)),
      ])
      path.scope.registerDeclaration(pageCompPath)
    },
  })
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
    if (ident && ident.node && isIdentifierReferenced(ident)) {
      state.refs.add(ident.node.name)
    }
  }

  return {
    visitor: {
      Program: {
        enter(_, state) {
          state.refs = new Set<string>()
          state.isPrerender = false
          state.done = false
        },
        exit(path, state) {
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
              ident &&
              ident.node &&
              refs.has(ident.node.name) &&
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
                if (
                  refs.has(local.node.name) &&
                  !isIdentifierReferenced(local)
                ) {
                  ++count
                  path.remove()
                }
              },
              FunctionDeclaration: sweepFunction,
              FunctionExpression: sweepFunction,
              ArrowFunctionExpression: sweepFunction,
            })
          } while (count)

          if (state.isPrerender) {
            decorateSsgExport(t, path, state)
          }
        },
      },
      VariableDeclarator(path, state) {
        if (path.node.id.type !== 'Identifier') {
          return
        }

        const local = path.get('id') as NodePath<BabelTypes.Identifier>
        if (isIdentifierReferenced(local)) {
          state.refs.add(path.node.id.name)
        }
      },
      FunctionDeclaration: markFunction,
      FunctionExpression: markFunction,
      ArrowFunctionExpression: markFunction,
      ExportNamedDeclaration(path, state) {
        const specifiers = path.get('specifiers')
        if (specifiers.length) {
          specifiers.forEach(s => {
            if (ssgExports.has(s.node.exported.name)) {
              state.isPrerender = true
              s.remove()
            }
          })

          if (path.node.specifiers.length < 1) {
            path.remove()
          }
          return
        }

        const decl = path.get('declaration')
        if (decl == null || decl.node == null) {
          return
        }

        switch (decl.node.type) {
          case 'FunctionDeclaration': {
            const name = decl.node.id!.name
            if (ssgExports.has(name)) {
              state.isPrerender = true
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
              if (ssgExports.has(name)) {
                state.isPrerender = true
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
  }
}
