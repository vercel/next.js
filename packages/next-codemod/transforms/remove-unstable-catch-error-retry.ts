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

  // True when `name` already resolves to a binding visible at `scope`. Used to
  // detect a collision before renaming a binding onto the stable name, so we can
  // alias instead of shadowing/duplicating an existing `catchError`/`retry`.
  function nameInScope(scope: any, name: string): boolean {
    return !!(scope && scope.lookup(name))
  }

  // Source-less re-exports of a renamed local binding, e.g.
  //   import { unstable_catchError } from 'next/error'
  //   export { unstable_catchError }        -> export { catchError }
  //   export { unstable_catchError as foo } -> export { catchError as foo }
  // Only specifiers whose local resolves to `bindingScope` are touched.
  function renameLocalExports(
    oldName: string,
    newName: string,
    bindingScope: any
  ): void {
    root.find(j.ExportNamedDeclaration).forEach((path) => {
      if (path.node.source) return
      const scope = path.scope
      if (!scope || scope.lookup(oldName) !== bindingScope) return
      path.node.specifiers?.forEach((specifier) => {
        if (
          specifier.type !== 'ExportSpecifier' ||
          specifier.local?.type !== 'Identifier' ||
          specifier.local.name !== oldName
        ) {
          return
        }
        const exportedWasOld =
          !specifier.exported || specifier.exported.name === oldName
        specifier.local = j.identifier(newName)
        if (exportedWasOld) {
          specifier.exported = j.identifier(newName)
        }
      })
    })
  }

  // Drops duplicate named exports (keeping the first) that collapsing aliases can
  // create, since duplicate ESM export names are a syntax error. Only removes
  // duplicates, which never exist in valid input.
  function dedupeExports(): void {
    const seen = new Set<string>()
    root.find(j.ExportNamedDeclaration).forEach((path) => {
      const specifiers = path.node.specifiers
      if (!specifiers || specifiers.length === 0) return
      const kept = specifiers.filter((specifier: any) => {
        if (
          specifier.type !== 'ExportSpecifier' ||
          specifier.exported?.type !== 'Identifier'
        ) {
          return true
        }
        if (seen.has(specifier.exported.name)) return false
        seen.add(specifier.exported.name)
        return true
      })
      if (kept.length === specifiers.length) return
      if (kept.length === 0 && !path.node.declaration) {
        j(path).remove()
      } else {
        path.node.specifiers = kept
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
    // Keyed by name -> the binding scopes where that name is the module binding,
    // so a shadowing local of the same name is never treated as the module.
    const moduleVariables = new Map<string, any[]>()
    const addModuleVariable = (name: string, scope: any): void => {
      const scopes = moduleVariables.get(name) || []
      scopes.push(scope)
      moduleVariables.set(name, scopes)
    }
    const isModuleVariable = (name: string, scope: any): boolean => {
      const scopes = moduleVariables.get(name)
      return !!scopes && scopes.indexOf(scope) !== -1
    }

    // import { unstable_catchError } from 'next/error'
    root
      .find(j.ImportDeclaration, { source: { value: source } })
      .forEach((path) => {
        path.node.specifiers?.forEach((specifier) => {
          if (specifier.type === 'ImportNamespaceSpecifier') {
            addModuleVariable(specifier.local.name, path.scope)
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
            if (nameInScope(path.scope, newName)) {
              // `catchError` already exists in scope: alias to keep the local
              // name so existing references and the existing binding are safe.
              const idx = path.node.specifiers.indexOf(specifier)
              path.node.specifiers[idx] = j.importSpecifier(
                j.identifier(newName),
                j.identifier(oldName)
              )
            } else {
              // import { unstable_x } -> import { x }; rename bound references
              // and any source-less re-export of this binding.
              renameReferences(oldName, newName, path.scope, path)
              renameLocalExports(oldName, newName, path.scope)
              specifier.imported = j.identifier(newName)
            }
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
          addModuleVariable(parent.id.name, declaratorPath.scope)
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
            if (nameInScope(declaratorPath.scope, newName)) {
              // `catchError` already exists in scope: keep the local name.
              property.key = j.identifier(newName)
              property.value = j.identifier(oldName)
              property.shorthand = false
            } else {
              renameReferences(
                oldName,
                newName,
                declaratorPath.scope,
                declaratorPath
              )
              property.key = j.identifier(newName)
              property.value = j.identifier(newName)
              property.shorthand = true
            }
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
        !!path.scope &&
        isModuleVariable(node.object.name, path.scope.lookup(node.object.name))
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

    if (changed) dedupeExports()

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
    const isMember = (m: any, name: string): boolean =>
      m.type === 'TSPropertySignature' &&
      m.key?.type === 'Identifier' &&
      m.key.name === name
    const hasResetSibling = (members || []).some((m) => isMember(m, sibling))
    if (!hasResetSibling) return false
    // Skip if `retry` already exists as a member to avoid a duplicate key.
    if ((members || []).some((m) => isMember(m, newName))) return false
    let changed = false
    members.forEach((m) => {
      if (isMember(m, oldName)) {
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
        // If `retry` is already bound in this scope, aliasing onto it would
        // shadow the existing binding or duplicate it; keep the local name.
        const collides = nameInScope(patternPath.scope, newName)
        if (value?.type === 'Identifier' && value.name === oldName) {
          if (collides) {
            // { retry: unstable_retry }: read the new prop, keep the local name.
            property.key = j.identifier(newName)
            property.value = j.identifier(oldName)
            property.shorthand = false
          } else {
            // shorthand { unstable_retry } -> { retry }
            renameReferences(oldName, newName, patternPath.scope, patternPath)
            property.key = j.identifier(newName)
            property.value = j.identifier(newName)
            property.shorthand = true
          }
        } else if (
          value?.type === 'AssignmentPattern' &&
          value.left?.type === 'Identifier' &&
          value.left.name === oldName
        ) {
          // { unstable_retry = defaultValue }
          if (collides) {
            property.key = j.identifier(newName)
            property.shorthand = false
          } else {
            renameReferences(oldName, newName, patternPath.scope, patternPath)
            property.key = j.identifier(newName)
            value.left = j.identifier(newName)
            property.shorthand = true
          }
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

    // 3. Member access: obj.unstable_retry where the SAME `obj` binding also has
    // an `obj.reset` access. Matching is by binding identity (scope lookup), not
    // by name, so a same-named object in another scope is never rewritten.
    const siblingBindingScopes = new Map<string, Set<any>>()
    root.find(j.MemberExpression).forEach((path) => {
      const node = path.node
      if (
        node.object?.type === 'Identifier' &&
        !node.computed &&
        node.property?.type === 'Identifier' &&
        node.property.name === sibling
      ) {
        const objName = node.object.name
        const bindingScope = path.scope ? path.scope.lookup(objName) : null
        const set = siblingBindingScopes.get(objName) || new Set()
        set.add(bindingScope)
        siblingBindingScopes.set(objName, set)
      }
    })
    if (siblingBindingScopes.size > 0) {
      root.find(j.MemberExpression).forEach((path) => {
        const node = path.node
        if (node.object?.type !== 'Identifier') return
        const set = siblingBindingScopes.get(node.object.name)
        if (!set) return
        const bindingScope = path.scope
          ? path.scope.lookup(node.object.name)
          : null
        if (!set.has(bindingScope)) return
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
