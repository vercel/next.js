import { types as BabelTypes } from 'next/dist/compiled/babel/core'
import { isDeepStrictEqual } from 'util'
import type { IstanbulRawFileCoverage } from './istanbul-types'
import type {
  CallExpression,
  JSXElement,
  JSXFragment,
  Node,
  ObjectProperty,
  Program,
} from '@babel/types'

const { react } = BabelTypes

type Point = { line: number; column: number }
type Mapping = {
  generated: Point
  source: string | null
  original: { line: number | null; column: number | null }
}
type Semantic = (value: unknown, project?: Project) => unknown
type Project = (value: unknown) => unknown
const pointKey = (point: Point) => `${point.line}:${point.column}`
function requireRole(value: unknown): asserts value {
  if (!value) throw new Error('Incomplete actual JSX compiler mapping role.')
}
function propertyName(node: ObjectProperty) {
  if (node.key.type === 'Identifier') return node.key.name
  if (node.key.type === 'StringLiteral') return node.key.value
}
function isVoidZero(node: Node | undefined) {
  return (
    node?.type === 'UnaryExpression' &&
    node.operator === 'void' &&
    node.argument.type === 'NumericLiteral' &&
    node.argument.value === 0
  )
}

/** Compare mapped JSX content without assuming generated local helper names. */
export function createIstanbulJsxBodyProjection({
  file,
  authored,
  emitted,
  mappings,
  tokens,
  rawCoverage,
  semantic,
}: {
  file: string
  authored: Program
  emitted: Program
  mappings: readonly Mapping[]
  tokens: readonly unknown[]
  rawCoverage: IstanbulRawFileCoverage
  semantic: Semantic
}):
  | {
      supportStatements: ReadonlySet<unknown>
      project: Project
      reportMappings: readonly { generated: Point; original: Point }[]
    }
  | undefined {
  const elements = new Map<string, JSXElement | JSXFragment>()
  const ignored = new Set([
    'loc',
    'start',
    'end',
    'extra',
    'comments',
    'leadingComments',
    'trailingComments',
    'innerComments',
  ])
  function visit(value: unknown) {
    if (!value || typeof value !== 'object') return
    if (Array.isArray(value)) {
      for (const child of value) visit(child)
      return
    }
    const node = value as Node
    if (node.type === 'JSXElement' || node.type === 'JSXFragment') {
      requireRole(node.loc)
      const key = pointKey(node.loc.start)
      requireRole(!elements.has(key))
      elements.set(key, node)
    }
    for (const [key, child] of Object.entries(value))
      if (!ignored.has(key)) visit(child)
  }
  visit(authored)
  if (!elements.size) return
  const roles = new Map<string, Mapping[]>()
  for (const mapping of mappings) {
    const key = pointKey(mapping.generated)
    const entries = roles.get(key) ?? []
    entries.push(mapping)
    roles.set(key, entries)
  }
  const factories = new Map<string, string>()
  const filenames = new Map<string, string>()
  const supportStatements = new Set<unknown>()
  for (const node of emitted.body) {
    if (node.type === 'ImportDeclaration') {
      requireRole(
        ['react/jsx-dev-runtime', 'react/jsx-runtime'].includes(
          node.source.value
        )
      )
      for (const specifier of node.specifiers) {
        requireRole(specifier.type === 'ImportSpecifier')
        const imported =
          specifier.imported.type === 'Identifier'
            ? specifier.imported.name
            : specifier.imported.value
        requireRole(['jsx', 'jsxs', 'jsxDEV', 'Fragment'].includes(imported))
        requireRole(!factories.has(specifier.local.name))
        factories.set(specifier.local.name, imported)
      }
      supportStatements.add(node)
    } else if (node.type === 'VariableDeclaration') {
      requireRole(node.kind === 'const' && node.declarations.length)
      for (const declaration of node.declarations) {
        requireRole(declaration.id.type === 'Identifier')
        requireRole(declaration.init?.type === 'StringLiteral')
        requireRole(declaration.init.value === file)
        requireRole(!filenames.has(declaration.id.name))
        filenames.set(declaration.id.name, declaration.init.value)
      }
      supportStatements.add(node)
    }
  }
  function anchor(generated: Point, original: Point) {
    const entries = roles.get(pointKey(generated)) ?? []
    return (
      entries.length === 1 &&
      entries[0].source === file &&
      entries[0].original.line === original.line &&
      entries[0].original.column === original.column
    )
  }
  const reportMappings: { generated: Point; original: Point }[] = []
  const closingRoles = new Map<string, Point>()
  const project: Project = (value) => {
    if (!value || typeof value !== 'object') return
    const call = value as CallExpression
    if (
      call.type !== 'CallExpression' ||
      call.callee.type !== 'Identifier' ||
      !['jsx', 'jsxs', 'jsxDEV'].includes(factories.get(call.callee.name) ?? '')
    )
      return
    requireRole(call.loc)
    const entries = roles.get(pointKey(call.loc.start)) ?? []
    requireRole(entries.length === 1 && entries[0].source === file)
    const original = elements.get(
      `${entries[0].original.line}:${entries[0].original.column}`
    )
    requireRole(original?.loc)
    const args = call.arguments
    if (original.type === 'JSXElement') {
      const name = original.openingElement.name
      requireRole(name.type === 'JSXIdentifier' && name.loc)
      requireRole(args[0]?.type === 'StringLiteral' && args[0].loc)
      requireRole(args[0].value === name.name)
      requireRole(anchor(args[0].loc.start, name.loc.start))
    } else {
      requireRole(args[0]?.type === 'Identifier')
      requireRole(factories.get(args[0].name) === 'Fragment')
    }
    const expectedProps: unknown[] = []
    let expectedKey: unknown
    if (original.type === 'JSXElement')
      for (const attribute of original.openingElement.attributes) {
        if (attribute.type === 'JSXSpreadAttribute') {
          expectedProps.push({
            type: 'SpreadElement',
            argument: semantic(attribute.argument),
          })
          continue
        }
        requireRole(attribute.name.type === 'JSXIdentifier')
        const content =
          attribute.value?.type === 'JSXExpressionContainer'
            ? attribute.value.expression
            : (attribute.value ?? { type: 'BooleanLiteral', value: true })
        if (attribute.name.name === 'key') {
          expectedKey = semantic(content)
          continue
        }
        expectedProps.push({
          type: 'ObjectProperty',
          key: attribute.name.name,
          value: semantic(content),
        })
      }
    const children = react.buildChildren(original)
    if (children.length)
      expectedProps.push({
        type: 'ObjectProperty',
        key: 'children',
        value:
          children.length === 1
            ? semantic(children[0])
            : {
                type: 'ArrayExpression',
                elements: children.map((child: unknown) => semantic(child)),
              },
      })
    requireRole(args[1]?.type === 'ObjectExpression')
    const actualProps = args[1].properties.map((property) => {
      if (property.type === 'SpreadElement')
        return {
          type: property.type,
          argument: semantic(property.argument, project),
        }
      requireRole(property.type === 'ObjectProperty' && !property.computed)
      const name = propertyName(property)
      requireRole(typeof name === 'string')
      return {
        type: property.type,
        key: name,
        value: semantic(property.value, project),
      }
    })
    requireRole(isDeepStrictEqual(actualProps, expectedProps))
    if (expectedKey !== undefined)
      requireRole(isDeepStrictEqual(semantic(args[2], project), expectedKey))
    else requireRole(args[2] === undefined || isVoidZero(args[2]))
    if (factories.get(call.callee.name) === 'jsxDEV') {
      const staticChildren = children.length > 1
      requireRole(
        args[3]?.type === 'BooleanLiteral' && args[3].value === staticChildren
      )
      if (args.length !== 4 || original.type !== 'JSXFragment') {
        requireRole(args.length === 6 && args[4]?.type === 'ObjectExpression')
        const debug: Record<string, unknown> = {}
        for (const property of args[4].properties) {
          requireRole(property.type === 'ObjectProperty' && !property.computed)
          const name = propertyName(property)
          requireRole(typeof name === 'string' && !(name in debug))
          debug[name] =
            property.value.type === 'StringLiteral' ||
            property.value.type === 'NumericLiteral'
              ? property.value.value
              : property.value.type === 'Identifier'
                ? filenames.get(property.value.name)
                : undefined
        }
        requireRole(
          Object.keys(debug).length === 3 &&
            debug.fileName === file &&
            debug.lineNumber === original.loc.start.line &&
            debug.columnNumber === original.loc.start.column + 1
        )
        requireRole(args[5]?.type === 'ThisExpression')
      }
    } else requireRole(args.length === 2 || args.length === 3)
    if (
      original.type === 'JSXElement' &&
      children.length === 1 &&
      children[0].type === 'ConditionalExpression'
    ) {
      const authoredChild = children[0]
      requireRole(
        original.children.filter(
          (child) =>
            child.type === 'JSXExpressionContainer' &&
            child.expression === authoredChild
        ).length === 1
      )
      const closingName = original.closingElement?.name
      requireRole(
        closingName?.type === 'JSXIdentifier' &&
          closingName.loc &&
          original.openingElement.name.type === 'JSXIdentifier' &&
          closingName.name === original.openingElement.name.name
      )
      const properties = args[1].properties
      const property = properties[properties.length - 1]
      requireRole(
        property?.type === 'ObjectProperty' &&
          propertyName(property) === 'children' &&
          property.value.type === 'ConditionalExpression'
      )
      const conditional = property.value
      requireRole(
        conditional.loc &&
          conditional.consequent.loc &&
          conditional.alternate.loc
      )
      const range = (node: { loc?: { start: Point; end: Point } | null }) => ({
        start: { line: node.loc!.start.line, column: node.loc!.start.column },
        end: { line: node.loc!.end.line, column: node.loc!.end.column },
      })
      const branchRoles = Object.entries(rawCoverage.branchMap).filter(
        ([, role]) =>
          role.type === 'cond-expr' &&
          isDeepStrictEqual(role.loc, range(conditional)) &&
          isDeepStrictEqual(role.locations, [
            range(conditional.consequent),
            range(conditional.alternate),
          ])
      )
      requireRole(
        branchRoles.length === 1 &&
          rawCoverage.b[branchRoles[0][0]]?.length === 2
      )
      type Token = {
        type?: string | { label?: string }
        end?: number
        loc?: { start: Point; end: Point }
      }
      const closingTokens = (tokens as readonly Token[]).filter(
        (token) =>
          typeof token.type === 'object' &&
          token.type?.label === '}' &&
          token.end === args[1].end
      )
      requireRole(closingTokens.length === 1 && closingTokens[0].loc)
      const generated = {
        line: closingTokens[0].loc.start.line,
        column: closingTokens[0].loc.start.column,
      }
      const originalPoint = {
        line: closingName.loc.end.line,
        column: closingName.loc.end.column,
      }
      const at = pointKey(generated),
        existing = roles.get(at) ?? []
      if (existing.length)
        requireRole(
          existing.length === 1 &&
            existing[0].source === file &&
            existing[0].original.line === originalPoint.line &&
            existing[0].original.column === originalPoint.column
        )
      else if (closingRoles.has(at))
        requireRole(isDeepStrictEqual(closingRoles.get(at), originalPoint))
      else {
        closingRoles.set(at, originalPoint)
        reportMappings.push({ generated, original: originalPoint })
      }
    }
    return semantic(original)
  }
  return { supportStatements, project, reportMappings }
}
