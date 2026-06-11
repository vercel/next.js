import type { API, FileInfo, Options } from 'jscodeshift'
import { createParserFromPath } from '../lib/parser'

// `catchError` and the `retry` error prop dropped their `unstable_` prefix when
// they stabilized. This codemod migrates both, scoped narrowly so it never
// rewrites unrelated identifiers that happen to share the name:
//
//   1. `unstable_catchError` is a named export of `next/error`. Only references
//      bound to that import are renamed; a local that shadows the name in a
//      nested scope is left untouched (scope-aware rename).
//   2. `unstable_retry` is a framework-injected prop on `error`/`global-error`
//      components and on `ErrorInfo` (the `catchError` callback argument). It
//      has no import to anchor on, so it is renamed only in error-prop-shaped
//      positions: a destructure, type, or member access that also carries the
//      sibling `reset` prop. Unrelated imports, locals, parameters, and object
//      literals named `unstable_retry` are left untouched.

// Named exports keyed by the module they come from.
const IMPORT_RENAMES_BY_SOURCE: Record<string, Record<string, string>> = {
  'next/error': {
    unstable_catchError: 'catchError',
  },
}

// Stabilized framework-injected props. `sibling` is a co-located prop that must
// be present for a position to be treated as the error-prop shape.
const PROP_RENAMES: Array<{ from: string; to: string; sibling: string }> = [
  { from: 'unstable_retry', to: 'retry', sibling: 'reset' },
]

export default function transformer(
  file: FileInfo,
  _api: API,
  options: Options
) {
  const j = createParserFromPath(file.path)
  const root = j(file.source)
  let hasChanges = false

  function isWithin(path: any, ancestor: any): boolean {
    let cur = path
    while (cur) {
      if (cur.node === ancestor.node) return true
      cur = cur.parent
    }
    return false
  }

  // True when `path` is an identifier used as a value reference, not a binding,
  // declaration, import/export specifier, property key, or member property.
  function isReferencePosition(path: any): boolean {
    const node = path.node
    const parent = path.parent?.node
    if (!parent) return false
    switch (parent.type) {
      case 'ImportSpecifier':
      case 'ImportDefaultSpecifier':
      case 'ImportNamespaceSpecifier':
      case 'ExportSpecifier':
        return false
      case 'ObjectProperty':
      case 'Property':
      case 'ObjectMethod':
      case 'ClassMethod':
      case 'ClassProperty':
      case 'TSPropertySignature':
        if (parent.key === node && !parent.computed) return false
        break
      case 'MemberExpression':
      case 'OptionalMemberExpression':
        if (parent.property === node && !parent.computed) return false
        break
      case 'VariableDeclarator':
      case 'FunctionDeclaration':
      case 'FunctionExpression':
      case 'ClassDeclaration':
        if (parent.id === node) return false
        break
    }
    return true
  }

  // Renames value references of `oldName` to `newName` that resolve to
  // `bindingScope`, skipping anything inside `declPath` (the binding site) and
  // any reference that resolves to a different (shadowing) scope. Must run
  // before the binding itself is renamed so scope lookup still finds `oldName`.
  function renameReferences(
    oldName: string,
    newName: string,
    bindingScope: any,
    declPath: any
  ): void {
    root.find(j.Identifier, { name: oldName }).forEach((path) => {
      if (declPath && isWithin(path, declPath)) return
      if (!isReferencePosition(path)) return
      const scope = path.scope
      if (scope && scope.lookup(oldName) === bindingScope) {
        path.node.name = newName
      }
    })
  }

  function renameImportedApi(
    source: string,
    mapping: Record<string, string>
  ): boolean {
    let changed = false
    const shouldRename = (name: string): boolean => name in mapping
    // Variables bound to the whole module: `import * as m`, `const m = require()`.
    const moduleVariables = new Set<string>()

    // import { unstable_catchError } from 'next/error'
    root
      .find(j.ImportDeclaration, { source: { value: source } })
      .forEach((path) => {
        path.node.specifiers?.forEach((specifier) => {
          if (specifier.type === 'ImportNamespaceSpecifier') {
            moduleVariables.add(specifier.local.name)
            return
          }
          if (
            specifier.type !== 'ImportSpecifier' ||
            specifier.imported?.type !== 'Identifier' ||
            !shouldRename(specifier.imported.name)
          ) {
            return
          }
          const oldName = specifier.imported.name
          const newName = mapping[oldName]
          const localName = specifier.local ? specifier.local.name : oldName

          if (localName === newName) {
            // import { unstable_x as x } -> import { x }
            const idx = path.node.specifiers.indexOf(specifier)
            path.node.specifiers[idx] = j.importSpecifier(j.identifier(newName))
          } else if (localName === oldName) {
            // import { unstable_x } -> import { x }; rename bound references
            renameReferences(oldName, newName, path.scope, path)
            specifier.imported = j.identifier(newName)
          } else {
            // import { unstable_x as foo } -> import { x as foo }; keep usages
            specifier.imported = j.identifier(newName)
          }
          changed = true
        })
      })

    // export { unstable_catchError } from 'next/error'
    root
      .find(j.ExportNamedDeclaration, { source: { value: source } })
      .forEach((path) => {
        path.node.specifiers?.forEach((specifier) => {
          if (
            specifier.type !== 'ExportSpecifier' ||
            specifier.local?.type !== 'Identifier' ||
            !shouldRename(specifier.local.name)
          ) {
            return
          }
          const oldName = specifier.local.name
          const newName = mapping[oldName]

          if (specifier.exported && specifier.exported.name === newName) {
            // export { unstable_x as x } -> export { x }
            const idx = path.node.specifiers.indexOf(specifier)
            path.node.specifiers[idx] = j.exportSpecifier.from({
              local: j.identifier(newName),
              exported: j.identifier(newName),
            })
          } else {
            specifier.local = j.identifier(newName)
            if (!specifier.exported || specifier.exported.name === oldName) {
              specifier.exported = j.identifier(newName)
            }
          }
          changed = true
        })
      })

    // const { unstable_catchError } = require('next/error')
    // const nextError = require('next/error')
    root
      .find(j.CallExpression, { callee: { name: 'require' } })
      .forEach((path) => {
        if (
          path.node.arguments[0]?.type !== 'StringLiteral' ||
          path.node.arguments[0].value !== source
        ) {
          return
        }
        const declaratorPath = path.parent
        const parent = declaratorPath?.node
        if (parent?.type !== 'VariableDeclarator') return

        if (parent.id?.type === 'Identifier') {
          moduleVariables.add(parent.id.name)
          return
        }
        if (parent.id?.type !== 'ObjectPattern') return

        parent.id.properties?.forEach((property: any) => {
          if (
            property.type !== 'ObjectProperty' ||
            property.key?.type !== 'Identifier' ||
            !shouldRename(property.key.name)
          ) {
            return
          }
          const oldName = property.key.name
          const newName = mapping[oldName]
          const valueName =
            property.value?.type === 'Identifier' ? property.value.name : null

          if (valueName === oldName) {
            renameReferences(
              oldName,
              newName,
              declaratorPath.scope,
              declaratorPath
            )
            property.key = j.identifier(newName)
            property.value = j.identifier(newName)
            property.shorthand = true
          } else if (valueName === newName) {
            property.key = j.identifier(newName)
            property.value = j.identifier(newName)
            property.shorthand = true
          } else {
            // const { unstable_x: foo } = require(...): rename the source key only
            property.key = j.identifier(newName)
          }
          changed = true
        })
      })

    // require('next/error').unstable_catchError and nextError.unstable_catchError
    root.find(j.MemberExpression).forEach((path) => {
      const node = path.node
      const isRequireOfSource =
        node.object?.type === 'CallExpression' &&
        node.object.callee?.type === 'Identifier' &&
        node.object.callee.name === 'require' &&
        node.object.arguments[0]?.type === 'StringLiteral' &&
        node.object.arguments[0].value === source
      const isModuleVar =
        node.object?.type === 'Identifier' &&
        moduleVariables.has(node.object.name)
      if (!isRequireOfSource && !isModuleVar) return

      if (
        !node.computed &&
        node.property?.type === 'Identifier' &&
        shouldRename(node.property.name)
      ) {
        node.property = j.identifier(mapping[node.property.name])
        changed = true
      } else if (
        node.computed &&
        node.property?.type === 'StringLiteral' &&
        shouldRename(node.property.value)
      ) {
        node.property = j.stringLiteral(mapping[node.property.value])
        changed = true
      }
    })

    return changed
  }

  function hasSibling(properties: any[], siblingName: string): boolean {
    return (properties || []).some(
      (pr) =>
        (pr.type === 'ObjectProperty' || pr.type === 'Property') &&
        pr.key?.type === 'Identifier' &&
        pr.key.name === siblingName
    )
  }

  function renameTypeMember(
    members: any[],
    oldName: string,
    newName: string,
    sibling: string
  ): boolean {
    const hasResetSibling = (members || []).some(
      (m) =>
        m.type === 'TSPropertySignature' &&
        m.key?.type === 'Identifier' &&
        m.key.name === sibling
    )
    if (!hasResetSibling) return false
    let changed = false
    members.forEach((m) => {
      if (
        m.type === 'TSPropertySignature' &&
        m.key?.type === 'Identifier' &&
        m.key.name === oldName
      ) {
        m.key = j.identifier(newName)
        changed = true
      }
    })
    return changed
  }

  function renameStabilizedProp(rename: {
    from: string
    to: string
    sibling: string
  }): boolean {
    const { from: oldName, to: newName, sibling } = rename
    let changed = false

    // 1. Destructured prop: { error, reset, unstable_retry } (param or const)
    root.find(j.ObjectPattern).forEach((patternPath) => {
      const props = patternPath.node.properties || []
      if (!hasSibling(props, sibling)) return
      props.forEach((property: any) => {
        if (
          property.type !== 'ObjectProperty' ||
          property.key?.type !== 'Identifier' ||
          property.key.name !== oldName
        ) {
          return
        }
        const value = property.value
        if (value?.type === 'Identifier' && value.name === oldName) {
          // shorthand { unstable_retry }
          renameReferences(oldName, newName, patternPath.scope, patternPath)
          property.key = j.identifier(newName)
          property.value = j.identifier(newName)
          property.shorthand = true
        } else if (
          value?.type === 'AssignmentPattern' &&
          value.left?.type === 'Identifier' &&
          value.left.name === oldName
        ) {
          // { unstable_retry = defaultValue }
          renameReferences(oldName, newName, patternPath.scope, patternPath)
          property.key = j.identifier(newName)
          value.left = j.identifier(newName)
          property.shorthand = true
        } else {
          // { unstable_retry: localAlias }: rename the source key only
          property.key = j.identifier(newName)
        }
        changed = true
      })
    })

    // 2. Type members: { error: ...; reset: ...; unstable_retry: ... }
    root.find(j.TSTypeLiteral).forEach((p) => {
      if (renameTypeMember(p.node.members, oldName, newName, sibling)) {
        changed = true
      }
    })
    root.find(j.TSInterfaceBody).forEach((p) => {
      if (renameTypeMember(p.node.body, oldName, newName, sibling)) {
        changed = true
      }
    })

    // 3. Member access: props.unstable_retry where props.reset is also accessed
    const siblingObjects = new Set<string>()
    root.find(j.MemberExpression).forEach((path) => {
      const node = path.node
      if (
        node.object?.type === 'Identifier' &&
        !node.computed &&
        node.property?.type === 'Identifier' &&
        node.property.name === sibling
      ) {
        siblingObjects.add(node.object.name)
      }
    })
    if (siblingObjects.size > 0) {
      root.find(j.MemberExpression).forEach((path) => {
        const node = path.node
        if (
          node.object?.type !== 'Identifier' ||
          !siblingObjects.has(node.object.name)
        ) {
          return
        }
        if (
          !node.computed &&
          node.property?.type === 'Identifier' &&
          node.property.name === oldName
        ) {
          node.property = j.identifier(newName)
          changed = true
        } else if (
          node.computed &&
          node.property?.type === 'StringLiteral' &&
          node.property.value === oldName
        ) {
          node.property = j.stringLiteral(newName)
          changed = true
        }
      })
    }

    return changed
  }

  try {
    for (const source of Object.keys(IMPORT_RENAMES_BY_SOURCE)) {
      if (renameImportedApi(source, IMPORT_RENAMES_BY_SOURCE[source])) {
        hasChanges = true
      }
    }

    for (const rename of PROP_RENAMES) {
      if (renameStabilizedProp(rename)) {
        hasChanges = true
      }
    }

    return hasChanges ? root.toSource(options) : file.source
  } catch (error) {
    console.warn(`Failed to transform ${file.path}: ${error.message}`)
    return file.source
  }
}
