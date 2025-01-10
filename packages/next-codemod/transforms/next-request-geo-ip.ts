import type {
  API,
  ASTPath,
  FileInfo,
  FunctionDeclaration,
  Collection,
  Node,
  ImportSpecifier,
  Identifier,
} from 'jscodeshift'
import { createParserFromPath } from '../lib/parser'

const GEO = 'geo'
const IP = 'ip'
const GEOLOCATION = 'geolocation'
const IP_ADDRESS = 'ipAddress'
const GEO_TYPE = 'Geo'

export default function (file: FileInfo, _api: API) {
  const j = createParserFromPath(file.path)
  const root = j(file.source)

  if (!root.length) {
    return file.source
  }

  const nextReqType = root
    .find(j.FunctionDeclaration)
    .find(j.Identifier, (id) => {
      if (id.typeAnnotation?.type !== 'TSTypeAnnotation') {
        return false
      }

      const typeAnn = id.typeAnnotation.typeAnnotation
      return (
        typeAnn.type === 'TSTypeReference' &&
        typeAnn.typeName.type === 'Identifier' &&
        typeAnn.typeName.name === 'NextRequest'
      )
    })

  const vercelFuncImports = root.find(j.ImportDeclaration, {
    source: {
      value: '@vercel/functions',
    },
  })

  const vercelFuncImportSpecifiers = vercelFuncImports
    .find(j.ImportSpecifier)
    .nodes()

  const vercelFuncImportNames = new Set(
    vercelFuncImportSpecifiers.map((node) => node.imported.name)
  )

  const hasGeolocation = vercelFuncImportNames.has(GEOLOCATION)
  const hasIpAddress = vercelFuncImportNames.has(IP_ADDRESS)
  const hasGeoType = vercelFuncImportNames.has(GEO_TYPE)

  let identifierNames = new Set<string>()

  // if all identifiers are already imported, we don't need to create
  // a unique identifier for them, therefore we don't look for all
  // identifier names in the file
  if (!hasGeolocation || !hasIpAddress || !hasGeoType) {
    const allIdentifiers = root.find(j.Identifier).nodes()
    identifierNames = new Set(allIdentifiers.map((node) => node.name))
  }

  let geoIdentifier = hasGeolocation
    ? getExistingIdentifier(vercelFuncImportSpecifiers, GEOLOCATION)
    : getUniqueIdentifier(identifierNames, GEOLOCATION)

  let ipIdentifier = hasIpAddress
    ? getExistingIdentifier(vercelFuncImportSpecifiers, IP_ADDRESS)
    : getUniqueIdentifier(identifierNames, IP_ADDRESS)

  let geoTypeIdentifier = hasGeoType
    ? getExistingIdentifier(vercelFuncImportSpecifiers, GEO_TYPE)
    : getUniqueIdentifier(identifierNames, GEO_TYPE)

  let { needImportGeolocation, needImportIpAddress } = replaceGeoIpValues(
    j,
    nextReqType,
    geoIdentifier,
    ipIdentifier
  )
  let { needImportGeoType, hasChangedIpType } = replaceGeoIpTypes(
    j,
    root,
    geoTypeIdentifier
  )

  let needChanges =
    needImportGeolocation ||
    needImportIpAddress ||
    needImportGeoType ||
    hasChangedIpType

  if (!needChanges) {
    return file.source
  }

  // Even if there was a change above, if there's an existing import,
  // we don't need to import them again.
  needImportGeolocation = !hasGeolocation && needImportGeolocation
  needImportIpAddress = !hasIpAddress && needImportIpAddress
  needImportGeoType = !hasGeoType && needImportGeoType

  insertImportDeclarations(
    j,
    root,
    vercelFuncImports,
    needImportGeolocation,
    needImportIpAddress,
    needImportGeoType,
    geoIdentifier,
    ipIdentifier,
    geoTypeIdentifier
  )
  return root.toSource()
}

/**
 * Returns an existing identifier from the Vercel functions import declaration.
 */
function getExistingIdentifier(
  vercelFuncImportSpecifiers: ImportSpecifier[],
  identifier: string
) {
  const existingIdentifier = vercelFuncImportSpecifiers.find(
    (node) => node.imported.name === identifier
  )

  return (
    existingIdentifier?.local?.name ||
    existingIdentifier.imported.name ||
    identifier
  )
}

/**
 * Returns a unique identifier by adding a suffix to the original identifier
 * if it already exists in the set.
 */
function getUniqueIdentifier(identifierNames: Set<string>, identifier: string) {
  let suffix = 1
  let uniqueIdentifier = identifier
  while (identifierNames.has(uniqueIdentifier)) {
    uniqueIdentifier = `${identifier}${suffix}`
    suffix++
  }
  return uniqueIdentifier
}

/**
 * Replaces accessors `geo` and `ip` of NextRequest with corresponding
 * function calls from `@vercel/functions`.
 *
 * Creates new variable declarations for destructuring assignments.
 */
function replaceGeoIpValues(
  j: API['jscodeshift'],
  nextReqType: Collection<Identifier>,
  geoIdentifier: string,
  ipIdentifier: string
): {
  needImportGeolocation: boolean
  needImportIpAddress: boolean
} {
  let needImportGeolocation = false
  let needImportIpAddress = false

  for (const nextReqPath of nextReqType.paths()) {
    const fnPath: ASTPath<FunctionDeclaration> =
      nextReqPath.parentPath.parentPath
    const fn = j(fnPath)
    const blockStatement = fn.find(j.BlockStatement)
    const varDeclarators = fn.find(j.VariableDeclarator)

    // req.geo, req.ip
    const geoAccesses = blockStatement.find(
      j.MemberExpression,
      (me) =>
        me.object.type === 'Identifier' &&
        me.object.name === nextReqPath.node.name &&
        me.property.type === 'Identifier' &&
        me.property.name === GEO
    )
    const ipAccesses = blockStatement.find(
      j.MemberExpression,
      (me) =>
        me.object.type === 'Identifier' &&
        me.object.name === nextReqPath.node.name &&
        me.property.type === 'Identifier' &&
        me.property.name === IP
    )

    // var { geo, ip } = req
    const geoDestructuring = varDeclarators.filter(
      (path) =>
        path.node.id.type === 'ObjectPattern' &&
        path.node.id.properties.some(
          (prop) =>
            prop.type === 'ObjectProperty' &&
            prop.key.type === 'Identifier' &&
            prop.key.name === GEO
        )
    )
    const ipDestructuring = varDeclarators.filter(
      (path) =>
        path.node.id.type === 'ObjectPattern' &&
        path.node.id.properties.some(
          (prop) =>
            prop.type === 'ObjectProperty' &&
            prop.key.type === 'Identifier' &&
            prop.key.name === IP
        )
    )

    // geolocation(req), ipAddress(req)
    const geoCall = j.callExpression(j.identifier(geoIdentifier), [
      {
        ...nextReqPath.node,
        typeAnnotation: null,
      },
    ])
    const ipCall = j.callExpression(j.identifier(ipIdentifier), [
      {
        ...nextReqPath.node,
        typeAnnotation: null,
      },
    ])

    geoAccesses.replaceWith(geoCall)
    ipAccesses.replaceWith(ipCall)

    /**
     * For each destructuring assignment, we create a new variable
     * declaration and insert it after the current block statement.
     *
     * Before:
     *
     * ```
     * const { buildId, geo, ip } = req;
     * ```
     *
     * After:
     *
     * ```
     * const { buildId } = req;
     * const geo = geolocation(req);
     * const ip = ipAddress(req);
     * ```
     */
    geoDestructuring.forEach((path) => {
      if (path.node.id.type === 'ObjectPattern') {
        const properties = path.node.id.properties
        const geoProperty = properties.find(
          (prop) =>
            prop.type === 'ObjectProperty' &&
            prop.key.type === 'Identifier' &&
            prop.key.name === GEO
        )

        const otherProperties = properties.filter(
          (prop) => prop !== geoProperty
        )

        const geoDeclaration = j.variableDeclaration('const', [
          j.variableDeclarator(
            j.identifier(
              // Use alias from destructuring (if present) to retain references:
              // const { geo: geoAlias } = req; -> const geoAlias = geolocation(req);
              // This prevents errors from undeclared variables.
              geoProperty.type === 'ObjectProperty' &&
                geoProperty.value.type === 'Identifier'
                ? geoProperty.value.name
                : GEO
            ),
            geoCall
          ),
        ])

        path.node.id.properties = otherProperties
        path.parent.insertAfter(geoDeclaration)
      }
    })
    ipDestructuring.forEach((path) => {
      if (path.node.id.type === 'ObjectPattern') {
        const properties = path.node.id.properties
        const ipProperty = properties.find(
          (prop) =>
            prop.type === 'ObjectProperty' &&
            prop.key.type === 'Identifier' &&
            prop.key.name === IP
        )
        const otherProperties = properties.filter((prop) => prop !== ipProperty)

        const ipDeclaration = j.variableDeclaration('const', [
          j.variableDeclarator(
            j.identifier(
              // Use alias from destructuring (if present) to retain references:
              // const { ip: ipAlias } = req; -> const ipAlias = ipAddress(req);
              // This prevents errors from undeclared variables.
              ipProperty.type === 'ObjectProperty' &&
                ipProperty.value.type === 'Identifier'
                ? ipProperty.value.name
                : IP
            ),
            ipCall
          ),
        ])

        path.node.id.properties = otherProperties
        path.parent.insertAfter(ipDeclaration)
      }
    })

    needImportGeolocation =
      needImportGeolocation ||
      geoAccesses.length > 0 ||
      geoDestructuring.length > 0
    needImportIpAddress =
      needImportIpAddress || ipAccesses.length > 0 || ipDestructuring.length > 0
  }

  return {
    needImportGeolocation,
    needImportIpAddress,
  }
}

/**
 * Replaces the types of `NextRequest["geo"]` and `NextRequest["ip"]` with
 * corresponding types from `@vercel/functions`.
 */
function replaceGeoIpTypes(
  j: API['jscodeshift'],
  root: Collection<Node>,
  geoTypeIdentifier: string
): {
  needImportGeoType: boolean
  hasChangedIpType: boolean
} {
  let needImportGeoType = false
  let hasChangedIpType = false

  // get the type of NextRequest that has accessed for ip and geo
  // NextRequest['geo'], NextRequest['ip']
  const nextReqGeoType = root.find(
    j.TSIndexedAccessType,
    (tsIndexedAccessType) => {
      return (
        tsIndexedAccessType.objectType.type === 'TSTypeReference' &&
        tsIndexedAccessType.objectType.typeName.type === 'Identifier' &&
        tsIndexedAccessType.objectType.typeName.name === 'NextRequest' &&
        tsIndexedAccessType.indexType.type === 'TSLiteralType' &&
        tsIndexedAccessType.indexType.literal.type === 'StringLiteral' &&
        tsIndexedAccessType.indexType.literal.value === GEO
      )
    }
  )
  const nextReqIpType = root.find(
    j.TSIndexedAccessType,
    (tsIndexedAccessType) => {
      return (
        tsIndexedAccessType.objectType.type === 'TSTypeReference' &&
        tsIndexedAccessType.objectType.typeName.type === 'Identifier' &&
        tsIndexedAccessType.objectType.typeName.name === 'NextRequest' &&
        tsIndexedAccessType.indexType.type === 'TSLiteralType' &&
        tsIndexedAccessType.indexType.literal.type === 'StringLiteral' &&
        tsIndexedAccessType.indexType.literal.value === IP
      )
    }
  )

  if (nextReqGeoType.length > 0) {
    needImportGeoType = true

    // replace with type Geo
    nextReqGeoType.replaceWith(j.identifier(geoTypeIdentifier))
  }

  if (nextReqIpType.length > 0) {
    hasChangedIpType = true

    // replace with type string | undefined
    nextReqIpType.replaceWith(
      j.tsUnionType([j.tsStringKeyword(), j.tsUndefinedKeyword()])
    )
  }

  return {
    needImportGeoType,
    hasChangedIpType,
  }
}

/**
 * Inserts import declarations from `"@vercel/functions"`.
 *
 * For the `Geo` type that needs to be imported to replace `NextRequest["geo"]`,
 * if it is the only import needed, we import it as a type.
 *
 * ```ts
 * import type { Geo } from "@vercel/functions";
 * ```
 *
 * Otherwise, we import it as an inline type import.
 *
 * ```ts
 * import { type Geo, ... } from "@vercel/functions";
 * ```
 */
function insertImportDeclarations(
  j: API['jscodeshift'],
  root: Collection<Node>,
  vercelFuncImports: Collection<Node>,
  needImportGeolocation: boolean,
  needImportIpAddress: boolean,
  needImportGeoType: boolean,
  geoIdentifier: string,
  ipIdentifier: string,
  geoTypeIdentifier: string
): void {
  // No need inserting import.
  if (!needImportGeolocation && !needImportIpAddress && !needImportGeoType) {
    return
  }

  // As we run this only when `NextRequest` is imported, there should be
  // a "next/server" import.
  const firstNextServerImport = root
    .find(j.ImportDeclaration, { source: { value: 'next/server' } })
    .at(0)
  const firstVercelFuncImport = vercelFuncImports.at(0)

  const hasVercelFuncImport = firstVercelFuncImport.length > 0

  // If there's no "@vercel/functions" import, and we only need to import
  // `Geo` type, we create a type import to avoid side effect with
  // `verbatimModuleSyntax`.
  // x-ref: https://typescript-eslint.io/rules/no-import-type-side-effects
  if (
    !hasVercelFuncImport &&
    !needImportGeolocation &&
    !needImportIpAddress &&
    needImportGeoType
  ) {
    const geoTypeImportDeclaration = j.importDeclaration(
      [
        needImportGeoType
          ? j.importSpecifier(
              j.identifier(GEO_TYPE),
              j.identifier(geoTypeIdentifier)
            )
          : null,
      ].filter(Boolean),
      j.literal('@vercel/functions'),
      // import type { Geo } ...
      'type'
    )
    firstNextServerImport.insertAfter(geoTypeImportDeclaration)
    return
  }

  const importDeclaration = j.importDeclaration(
    [
      // If there was a duplicate identifier, we add an
      // incremental number suffix to it and we use alias:
      // `import { geolocation as geolocation1 } from ...`
      needImportGeolocation
        ? j.importSpecifier(
            j.identifier(GEOLOCATION),
            j.identifier(geoIdentifier)
          )
        : null,
      needImportIpAddress
        ? j.importSpecifier(
            j.identifier(IP_ADDRESS),
            j.identifier(ipIdentifier)
          )
        : null,
      needImportGeoType
        ? j.importSpecifier(
            j.identifier(GEO_TYPE),
            j.identifier(geoTypeIdentifier)
          )
        : null,
    ].filter(Boolean),
    j.literal('@vercel/functions')
  )

  if (hasVercelFuncImport) {
    firstVercelFuncImport
      .get()
      .node.specifiers.push(...importDeclaration.specifiers)

    if (needImportGeoType) {
      const targetGeo = firstVercelFuncImport
        .get()
        .node.specifiers.find(
          (specifier) => specifier.imported.name === GEO_TYPE
        )
      if (targetGeo) {
        targetGeo.importKind = 'type'
      }
    }
  } else {
    if (needImportGeoType) {
      const targetGeo = importDeclaration.specifiers.find(
        (specifier) =>
          specifier.type === 'ImportSpecifier' &&
          specifier.imported.name === GEO_TYPE
      )
      if (targetGeo) {
        // @ts-expect-error -- Missing types in jscodeshift.
        targetGeo.importKind = 'type'
      }
    }
    firstNextServerImport.insertAfter(importDeclaration)
  }
}
