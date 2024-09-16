import type { API, ASTPath, FileInfo, FunctionDeclaration } from 'jscodeshift'

export default function (fileInfo: FileInfo, api: API) {
  const j = api.jscodeshift
  const root = api.jscodeshift(fileInfo.source)

  const params = root.find(j.FunctionDeclaration).find(j.Identifier, (id) => {
    if (id.typeAnnotation?.type !== 'TSTypeAnnotation') return false

    const typeAnn = id.typeAnnotation.typeAnnotation
    return (
      typeAnn.type === 'TSTypeReference' &&
      typeAnn.typeName.type === 'Identifier' &&
      typeAnn.typeName.name === 'NextRequest'
    )
  })

  const GEO = 'geo'
  const IP = 'ip'

  let needImportGeolocation = false
  let needImportIpAddress = false

  let geoIdentifier = 'geolocation'
  let ipIdentifier = 'ipAddress'

  // avoid duplicate identifiers for `geolocation` and `ipAddress`
  const allIdentifiers = root.find(j.Identifier).nodes()
  const identifierNames = new Set(allIdentifiers.map((node) => node.name))

  let suffix = 1
  while (
    identifierNames.has(geoIdentifier) ||
    identifierNames.has(ipIdentifier)
  ) {
    if (identifierNames.has(geoIdentifier)) {
      geoIdentifier = `geolocation${suffix}`
    }
    if (identifierNames.has(ipIdentifier)) {
      ipIdentifier = `ipAddress${suffix}`
    }
    suffix++
  }

  for (const param of params.paths()) {
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

    need_import_geolocation =
      need_import_geolocation ||
      geoAccesses.length > 0 ||
      geoDestructuring.length > 0
    need_import_ipAddress =
      need_import_ipAddress ||
      ipAccesses.length > 0 ||
      ipDestructuring.length > 0
  }

  if (need_import_geolocation || need_import_ipAddress) {
    const importDeclaration = j.importDeclaration(
      [
        need_import_geolocation
          ? j.importSpecifier(
              j.identifier('geolocation'),
              // If there was a duplicate identifier, we add an
              // incremental number suffix to it and we use alias:
              // `import { geolocation as geolocation1 } from ...`
              j.identifier(geoIdentifier)
            )
          : null,
        need_import_ipAddress
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

    root
      .find(j.ImportDeclaration, {
        source: {
          value: 'next/server',
        },
      })
      .insertAfter(importDeclaration)
  }

  return root.toSource()
}
