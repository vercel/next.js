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

const GEO = 'geo'
const IP = 'ip'
const GEOLOCATION = 'geolocation'
const IP_ADDRESS = 'ipAddress'
const GEO_TYPE = 'Geo'

export default function (fileInfo: FileInfo, api: API) {
  const j = api.jscodeshift
  const ast = j(fileInfo.source)

  if (!ast.length) {
    return fileInfo.source
  }

  const nextReqType = ast
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

  if (!nextReqType.length) {
    return fileInfo.source
  }

  const vercelFuncImports = ast
    .find(j.ImportDeclaration, {
      source: {
        value: '@vercel/functions',
      },
    })
    .find(j.ImportSpecifier)
    .nodes()

  const vercelFuncImportNames = new Set(
    vercelFuncImports.map((node) => node.imported.name)
  )

  const hasGeolocation = vercelFuncImportNames.has(GEOLOCATION)
  const hasIpAddress = vercelFuncImportNames.has(IP_ADDRESS)
  const hasGeoType = vercelFuncImportNames.has(GEO_TYPE)

  const allIdentifiers = ast.find(j.Identifier).nodes()
  const identifierNames = new Set(allIdentifiers.map((node) => node.name))

  let geoIdentifier = hasGeolocation
    ? getExistingIdentifier(vercelFuncImports, GEOLOCATION)
    : getUniqueIdentifier(identifierNames, GEOLOCATION)

  let ipIdentifier = hasIpAddress
    ? getExistingIdentifier(vercelFuncImports, IP_ADDRESS)
    : getUniqueIdentifier(identifierNames, IP_ADDRESS)

  let geoTypeIdentifier = hasGeoType
    ? getExistingIdentifier(vercelFuncImports, GEO_TYPE)
    : getUniqueIdentifier(identifierNames, GEO_TYPE)

  let { needImportGeolocation, needImportIpAddress } = replaceGeoIpValues(
    j,
    nextReqType,
    geoIdentifier,
    ipIdentifier
  )
  let { needImportGeoType } = replaceGeoIpTypes(j, ast, geoTypeIdentifier)

  const needChanges =
    needImportGeolocation || needImportIpAddress || needImportGeoType

  if (!needChanges) {
    return fileInfo.source
  }

  needImportGeolocation = !hasGeolocation && needImportGeolocation
  needImportIpAddress = !hasIpAddress && needImportIpAddress
  needImportGeoType = !hasGeoType && needImportGeoType

  insertImportDeclarations(
    j,
    ast,
    needImportGeolocation,
    needImportIpAddress,
    needImportGeoType,
    geoIdentifier,
    ipIdentifier,
    geoTypeIdentifier
  )
  return ast.toSource()
}

/**
 * Returns an existing identifier from the Vercel functions import declaration.
 */
function getExistingIdentifier(
  vercelFuncImports: ImportSpecifier[],
  identifier: string
) {
  const existingIdentifier = vercelFuncImports.find(
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
  ast: Collection<Node>,
  geoTypeIdentifier: string
): {
  needImportGeoType: boolean
} {
  let needImportGeoType = false

  // get the type of NextRequest that has accessed for ip and geo
  // NextRequest['geo'], NextRequest['ip']
  const nextReqGeoType = ast.find(
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
  const nextReqIpType = ast.find(
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
  }

  // replace with type Geo
  nextReqGeoType.replaceWith(j.identifier(geoTypeIdentifier))
  // replace with type string | undefined
  nextReqIpType.replaceWith(
    j.tsUnionType([j.tsStringKeyword(), j.tsUndefinedKeyword()])
  )

  return {
    needImportGeoType,
  }
}

function insertImportDeclarations(
  j: API['jscodeshift'],
  ast: Collection<Node>,
  needImportGeolocation: boolean,
  needImportIpAddress: boolean,
  needImportGeoType: boolean,
  geoIdentifier: string,
  ipIdentifier: string,
  geoTypeIdentifier: string
) {
  const nextServerImport = ast.find(j.ImportDeclaration, {
    source: {
      value: 'next/server',
    },
  })

  if (needImportGeolocation || needImportIpAddress) {
    const importDeclaration = j.importDeclaration(
      [
        needImportGeolocation
          ? j.importSpecifier(
              j.identifier(GEOLOCATION),
              // If there was a duplicate identifier, we add an
              // incremental number suffix to it and we use alias:
              // `import { geolocation as geolocation1 } from ...`
              j.identifier(geoIdentifier)
            )
          : null,
        needImportIpAddress
          ? j.importSpecifier(
              j.identifier(IP_ADDRESS),
              // If there was a duplicate identifier, we add an
              // incremental number suffix to it and we use alias:
              // `import { ipAddress as ipAddress1 } from ...`
              j.identifier(ipIdentifier)
            )
          : null,
      ].filter(Boolean),
      j.literal('@vercel/functions')
    )

    nextServerImport.insertAfter(importDeclaration)
  }

  if (needImportGeoType) {
    const geoTypeImportDeclaration = j.importDeclaration(
      [
        needImportGeoType
          ? j.importSpecifier(
              j.identifier(GEO_TYPE),
              // If there was a duplicate identifier, we add an
              // incremental number suffix to it and we use alias:
              // `import { Geo as Geo1 } from ...`
              j.identifier(geoTypeIdentifier)
            )
          : null,
      ].filter(Boolean),
      j.literal('@vercel/functions'),
      // Not using inline type import because it violates:
      // https://typescript-eslint.io/rules/no-import-type-side-effects
      'type'
    )
    nextServerImport.insertAfter(geoTypeImportDeclaration)
  }
}
