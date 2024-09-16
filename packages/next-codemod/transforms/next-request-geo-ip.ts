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

  let need_import_geolocation = false
  let need_import_ipAddress = false

  for (const param of params.paths()) {
    const fnPath: ASTPath<FunctionDeclaration> = param.parentPath.parentPath
    const fn = j(fnPath)

    const geoAccesses = fn
      .find(j.BlockStatement)
      .find(j.MemberExpression, (me) => {
        if (me.object.type !== 'Identifier') return false
        if (me.object.name !== param.node.name) return false
        if (me.property.type !== 'Identifier') return false

        return me.property.name === 'geo'
      })

    // Handle geo destructuring
    const geoDestructuring = fn.find(j.VariableDeclarator).filter((path) => {
      return (
        path.node.id.type === 'ObjectPattern' &&
        path.node.id.properties.some(
          (prop) =>
            prop.type === 'ObjectProperty' &&
            prop.key.type === 'Identifier' &&
            prop.key.name === 'geo'
        )
      )
    })

    const ipAccesses = fn
      .find(j.BlockStatement)
      .find(j.MemberExpression, (me) => {
        if (me.object.type !== 'Identifier') return false
        if (me.object.name !== param.node.name) return false
        if (me.property.type !== 'Identifier') return false

        return me.property.name === 'ip'
      })

    const ipDestructuring = fn.find(j.VariableDeclarator).filter((path) => {
      return (
        path.node.id.type === 'ObjectPattern' &&
        path.node.id.properties.some(
          (prop) =>
            prop.type === 'ObjectProperty' &&
            prop.key.type === 'Identifier' &&
            prop.key.name === 'ip'
        )
      )
    })

    const geoCall = j.callExpression(j.identifier('geolocation'), [
      {
        ...param.node,
        typeAnnotation: null,
      },
    ])
    const ipCall = j.callExpression(j.identifier('ipAddress'), [
      {
        ...param.node,
        typeAnnotation: null,
      },
    ])

    geoAccesses.replaceWith(geoCall)
    ipAccesses.replaceWith(ipCall)
    // if destructuring, add a new variable declaration for ip,
    // then remove the ip property from the destructuring
    // const { ip, foo, bar } = req
    // becomes:
    // const { foo, bar } = req
    // const ip = ipAddress(req)
    ipDestructuring.forEach((path) => {
      if (path.node.id.type === 'ObjectPattern') {
        const properties = path.node.id.properties
        const ipProperty = properties.find(
          (prop) =>
            prop.type === 'ObjectProperty' &&
            prop.key.type === 'Identifier' &&
            prop.key.name === 'ip'
        )
        const otherProperties = properties.filter((prop) => prop !== ipProperty)

        // Create new variable declaration for ip
        const ipDeclaration = j.variableDeclaration('const', [
          j.variableDeclarator(j.identifier('ip'), ipCall),
        ])

        // Update the original destructuring
        path.node.id.properties = otherProperties

        // Insert the new ip declaration after the updated destructuring
        path.parent.insertAfter(ipDeclaration)
      }
    })

    geoDestructuring.forEach((path) => {
      if (path.node.id.type === 'ObjectPattern') {
        const properties = path.node.id.properties
        const geoProperty = properties.find(
          (prop) =>
            prop.type === 'ObjectProperty' &&
            prop.key.type === 'Identifier' &&
            prop.key.name === 'geo'
        )
        const otherProperties = properties.filter(
          (prop) => prop !== geoProperty
        )

        // Create new variable declaration for geo
        const geoDeclaration = j.variableDeclaration('const', [
          j.variableDeclarator(j.identifier('geo'), geoCall),
        ])

        // Update the original destructuring
        path.node.id.properties = otherProperties

        // Insert the new geo declaration after the updated destructuring
        path.parent.insertAfter(geoDeclaration)
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
          ? j.importSpecifier(j.identifier('geolocation'))
          : null,
        need_import_ipAddress
          ? j.importSpecifier(j.identifier('ipAddress'))
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
