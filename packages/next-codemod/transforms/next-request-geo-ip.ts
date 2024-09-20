import type {
  API,
  ASTPath,
  FileInfo,
  FunctionDeclaration,
  Collection,
  Node,
} from 'jscodeshift'

const GEO = 'geo'
const IP = 'ip'

export default function (fileInfo: FileInfo, api: API) {
  const j = api.jscodeshift
  const ast = j(fileInfo.source)

  const allIdentifiers = ast.find(j.Identifier).nodes()
  const identifierNames = new Set(allIdentifiers.map((node) => node.name))

  let geoIdentifier = getUniqueIdentifier(identifierNames, 'geolocation')
  let ipIdentifier = getUniqueIdentifier(identifierNames, 'ipAddress')
  let geoTypeIdentifier = getUniqueIdentifier(identifierNames, 'Geo')

  const { needImportGeolocation, needImportIpAddress } = replaceGeoIpValues(
    j,
    ast,
    geoIdentifier,
    ipIdentifier
  )
  const { needImportGeoType } = replaceGeoIpTypes(j, ast, geoTypeIdentifier)

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

function getUniqueIdentifier(identifierNames: Set<string>, identifier: string) {
  let suffix = 1
  let uniqueIdentifier = identifier
  while (identifierNames.has(uniqueIdentifier)) {
    uniqueIdentifier = `${identifier}${suffix}`
    suffix++
  }
  return uniqueIdentifier
}

function replaceGeoIpValues(
  j: API['jscodeshift'],
  ast: Collection<Node>,
  geoIdentifier: string,
  ipIdentifier: string
) {
  const nextReqIdentifier = ast
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

  let needImportGeolocation = false
  let needImportIpAddress = false

  for (const param of nextReqIdentifier.paths()) {
    const fnPath: ASTPath<FunctionDeclaration> = param.parentPath.parentPath
    const fn = j(fnPath)
    const blockStatement = fn.find(j.BlockStatement)
    const varDeclarators = fn.find(j.VariableDeclarator)

    // req.geo, req.ip
    const geoAccesses = blockStatement.find(
      j.MemberExpression,
      (me) =>
        me.object.type === 'Identifier' &&
        me.object.name === param.node.name &&
        me.property.type === 'Identifier' &&
        me.property.name === GEO
    )
    const ipAccesses = blockStatement.find(
      j.MemberExpression,
      (me) =>
        me.object.type === 'Identifier' &&
        me.object.name === param.node.name &&
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
        ...param.node,
        typeAnnotation: null,
      },
    ])
    const ipCall = j.callExpression(j.identifier(ipIdentifier), [
      {
        ...param.node,
        typeAnnotation: null,
      },
    ])

    geoAccesses.replaceWith(geoCall)
    ipAccesses.replaceWith(ipCall)

    /*
      For each destructuring assignment, we create a new variable
      declaration and insert it after the current block statement.

      Before:
      ```
      var { buildId, geo, ip } = req;
      ```

      After:
      ```
      var { buildId } = req;
      const geo = geolocation(req);
      const ip = ipAddress(req);
      ```
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

function replaceGeoIpTypes(
  j: API['jscodeshift'],
  ast: Collection<Node>,
  geoTypeIdentifier: string
) {
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
              j.identifier('geolocation'),
              // If there was a duplicate identifier, we add an
              // incremental number suffix to it and we use alias:
              // `import { geolocation as geolocation1 } from ...`
              j.identifier(geoIdentifier)
            )
          : null,
        needImportIpAddress
          ? j.importSpecifier(
              j.identifier('ipAddress'),
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
              j.identifier('Geo'),
              j.identifier(geoTypeIdentifier)
            )
          : null,
      ].filter(Boolean),
      j.literal('@vercel/functions'),
      'type'
    )
    nextServerImport.insertAfter(geoTypeImportDeclaration)
  }
}
