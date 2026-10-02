import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, extname, join, relative, resolve } from 'node:path'
import type {
  API,
  ASTPath,
  FileInfo,
  FunctionExpression,
  FunctionDeclaration,
  ArrowFunctionExpression,
  Options,
} from 'jscodeshift'
import { createParserFromPath } from '../lib/parser'

const RESET_COMPONENT_NAME = 'CacheComponentsActivityReset'
const RESET_DIRECTORY_NAME = '_next-cache-components'
const RESET_MODULE_NAME = 'activity-reset'

const RESET_COMPONENT_TYPESCRIPT_SOURCE = `'use client'

import { Fragment, type ReactNode } from 'react'
import { useRouter } from 'next/navigation'

export function ${RESET_COMPONENT_NAME}({
  children,
}: {
  children: ReactNode
}) {
  const { bfcacheId } = useRouter()

  return <Fragment key={bfcacheId}>{children}</Fragment>
}
`

const RESET_COMPONENT_JAVASCRIPT_SOURCE = `'use client'

import { Fragment } from 'react'
import { useRouter } from 'next/navigation'

export function ${RESET_COMPONENT_NAME}({ children }) {
  const { bfcacheId } = useRouter()

  return <Fragment key={bfcacheId}>{children}</Fragment>
}
`

type ComponentFunction =
  | FunctionDeclaration
  | FunctionExpression
  | ArrowFunctionExpression

function isRouteSegment(path: string) {
  return /(^|[/\\])app[/\\](?:.*[/\\])?(page|layout|default)\.(js|jsx|ts|tsx)$/.test(
    path
  )
}

function getAppDirectory(path: string) {
  const normalizedPath = path.replace(/\\/g, '/')
  const segments = normalizedPath.split('/')
  const fileName = segments.pop()

  if (!fileName) return null

  const appIndex = segments.lastIndexOf('app')
  if (appIndex === -1) return null

  const appDirectory = segments.slice(0, appIndex + 1).join('/') || 'app'
  return path.includes('\\') ? appDirectory.replace(/\//g, '\\') : appDirectory
}

function getResetModuleSpecifier(filePath: string, appDirectory: string) {
  const resetModulePath = join(
    appDirectory,
    RESET_DIRECTORY_NAME,
    RESET_MODULE_NAME
  )
  let moduleSpecifier = relative(dirname(filePath), resetModulePath).replace(
    /\\/g,
    '/'
  )

  if (!moduleSpecifier.startsWith('.')) {
    moduleSpecifier = `./${moduleSpecifier}`
  }

  return moduleSpecifier
}

function findTypeScriptConfig(appDirectory: string) {
  let directory = resolve(appDirectory)

  while (true) {
    if (existsSync(join(directory, 'tsconfig.json'))) return true

    const parent = dirname(directory)
    if (parent === directory) return false
    directory = parent
  }
}

function writeResetComponent(appDirectory: string) {
  const resetDirectory = join(appDirectory, RESET_DIRECTORY_NAME)
  const usesTypeScript = findTypeScriptConfig(appDirectory)
  const resetFiles = ['tsx', 'jsx'].map((extension) =>
    join(resetDirectory, `${RESET_MODULE_NAME}.${extension}`)
  )
  const resetFile = resetFiles[usesTypeScript ? 0 : 1]
  const resetSource = usesTypeScript
    ? RESET_COMPONENT_TYPESCRIPT_SOURCE
    : RESET_COMPONENT_JAVASCRIPT_SOURCE

  mkdirSync(resetDirectory, { recursive: true })

  const existingResetFile = resetFiles.find((candidate) =>
    existsSync(candidate)
  )
  if (existingResetFile) {
    const existingSource = readFileSync(existingResetFile, 'utf8')
    const isCompatible =
      existingSource.includes(`export function ${RESET_COMPONENT_NAME}`) &&
      existingSource.includes('const { bfcacheId } = useRouter()')

    if (!isCompatible) {
      throw new Error(
        `Could not use ${existingResetFile} because it does not export a compatible ${RESET_COMPONENT_NAME} component.`
      )
    }
    return
  }

  try {
    writeFileSync(resetFile, resetSource, { flag: 'wx' })
  } catch (error: any) {
    if (error?.code !== 'EEXIST') throw error

    const existingSource = readFileSync(resetFile, 'utf8')
    if (
      !existingSource.includes(`export function ${RESET_COMPONENT_NAME}`) ||
      !existingSource.includes('const { bfcacheId } = useRouter()')
    ) {
      throw new Error(
        `Could not use ${resetFile} because it does not export a compatible ${RESET_COMPONENT_NAME} component.`
      )
    }
  }
}

export default function transformer(
  file: FileInfo,
  _api: API,
  options: Options
) {
  if (!isRouteSegment(file.path)) {
    return file.source
  }

  const appDirectory = getAppDirectory(file.path)
  if (!appDirectory) {
    return file.source
  }

  const j = createParserFromPath(file.path)
  const root = j(file.source)

  const alreadyWrapped =
    root
      .find(j.ImportDeclaration)
      .some((path) =>
        String(path.node.source.value).endsWith(
          `${RESET_DIRECTORY_NAME}/${RESET_MODULE_NAME}`
        )
      ) || root.find(j.JSXIdentifier, { name: RESET_COMPONENT_NAME }).size() > 0

  if (alreadyWrapped) {
    return file.source
  }

  const defaultExport = root.find(j.ExportDefaultDeclaration)
  if (defaultExport.size() !== 1) {
    return file.source
  }

  const exportPath = defaultExport.paths()[0]
  let componentPath: ASTPath<ComponentFunction> | null = null

  const resolveComponentPath = (path: ASTPath<any>) => {
    const node = path.node

    if (
      node.type === 'FunctionDeclaration' ||
      node.type === 'FunctionExpression' ||
      node.type === 'ArrowFunctionExpression'
    ) {
      return path as ASTPath<ComponentFunction>
    }

    if (node.type === 'Identifier') {
      const functionDeclaration = root.find(j.FunctionDeclaration, {
        id: { name: node.name },
      })

      if (functionDeclaration.size() === 1) {
        return functionDeclaration.paths()[0] as ASTPath<ComponentFunction>
      }

      const variable = root.find(j.VariableDeclarator, {
        id: { type: 'Identifier', name: node.name },
      })

      if (variable.size() === 1) {
        const initPath = variable.paths()[0].get('init') as ASTPath<any>
        if (initPath.node) return resolveComponentPath(initPath)
      }
    }

    if (node.type === 'CallExpression' && node.arguments.length > 0) {
      const firstArgument = path.get('arguments', 0) as ASTPath<any>
      if (firstArgument.node?.type !== 'SpreadElement') {
        return resolveComponentPath(firstArgument)
      }
    }

    if (
      node.type === 'TSAsExpression' ||
      node.type === 'TSSatisfiesExpression' ||
      node.type === 'TypeCastExpression'
    ) {
      return resolveComponentPath(path.get('expression') as ASTPath<any>)
    }

    return null
  }

  componentPath = resolveComponentPath(exportPath.get('declaration'))

  if (!componentPath) {
    return file.source
  }

  const usedNames = new Set(
    root
      .find(j.Identifier)
      .nodes()
      .map((identifier) => identifier.name)
  )
  let localResetName = RESET_COMPONENT_NAME
  while (usedNames.has(localResetName)) {
    localResetName += 'Boundary'
  }
  let localCreateElementName = 'createElementActivityReset'
  while (usedNames.has(localCreateElementName)) {
    localCreateElementName += 'Boundary'
  }

  const usesJsx = extname(file.path) !== '.ts'

  const isResetElement = (expression: any) =>
    expression?.type === 'JSXElement' &&
    expression.openingElement?.name?.type === 'JSXIdentifier' &&
    expression.openingElement.name.name === localResetName

  const wrapExpression = (expression: any) => {
    if (isResetElement(expression)) return expression

    if (!usesJsx) {
      return j.callExpression(j.identifier(localCreateElementName), [
        j.identifier(localResetName),
        j.nullLiteral(),
        expression,
      ])
    }

    const child =
      expression.type === 'JSXElement' || expression.type === 'JSXFragment'
        ? expression
        : j.jsxExpressionContainer(expression)

    return j.jsxElement(
      j.jsxOpeningElement(j.jsxIdentifier(localResetName), []),
      j.jsxClosingElement(j.jsxIdentifier(localResetName)),
      [child]
    )
  }

  const component = componentPath.node
  let wrappedReturn = false

  if (
    component.type === 'ArrowFunctionExpression' &&
    component.body.type !== 'BlockStatement'
  ) {
    component.body = wrapExpression(component.body)
    wrappedReturn = true
  } else {
    root.find(j.ReturnStatement).forEach((returnPath) => {
      if (!returnPath.node.argument) return

      let parentPath = returnPath.parentPath
      while (parentPath && parentPath.node !== component) {
        if (
          parentPath.node.type === 'FunctionDeclaration' ||
          parentPath.node.type === 'FunctionExpression' ||
          parentPath.node.type === 'ArrowFunctionExpression'
        ) {
          return
        }
        parentPath = parentPath.parentPath
      }

      if (parentPath?.node !== component) return

      returnPath.node.argument = wrapExpression(returnPath.node.argument)
      wrappedReturn = true
    })
  }

  if (!wrappedReturn) {
    return file.source
  }

  const resetImport = j.importDeclaration(
    [
      j.importSpecifier(
        j.identifier(RESET_COMPONENT_NAME),
        localResetName === RESET_COMPONENT_NAME
          ? null
          : j.identifier(localResetName)
      ),
    ],
    j.stringLiteral(getResetModuleSpecifier(file.path, appDirectory))
  )
  resetImport.comments = [
    j.commentLine(
      ' TODO: Cache Components adoption. Remove this wrapper after verifying this route no longer relies on unmounting to reset state.',
      true,
      false
    ),
    j.commentLine(
      ' See: https://nextjs.org/docs/app/guides/preserving-ui-state',
      true,
      false
    ),
  ]

  const program = root.get().node.program
  const body = program.body as any[]
  let lastImportIndex = -1
  for (let index = 0; index < body.length; index++) {
    if (body[index].type === 'ImportDeclaration') lastImportIndex = index
  }
  body.splice(lastImportIndex + 1, 0, resetImport)

  if (!usesJsx) {
    body.splice(
      lastImportIndex + 1,
      0,
      j.importDeclaration(
        [
          j.importSpecifier(
            j.identifier('createElement'),
            j.identifier(localCreateElementName)
          ),
        ],
        j.stringLiteral('react')
      )
    )
  }

  if (process.env.NODE_ENV !== 'test' && options.dry !== true) {
    writeResetComponent(appDirectory)
  }

  return root.toSource(options)
}
