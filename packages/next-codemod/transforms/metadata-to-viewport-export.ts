import type { API, FileInfo } from 'jscodeshift'

export default function transformer(file: FileInfo, api: API) {
  const j = api.jscodeshift
  const root = j(file.source)

  // Find the metadata export
  const metadataExport = root.find(j.ExportNamedDeclaration, {
    declaration: {
      type: 'VariableDeclaration',
      declarations: [
        {
          id: { name: 'metadata' },
        },
      ],
    },
  })

  if (metadataExport.size() !== 1) {
    return
  }

  const metadataObject = metadataExport.find(j.ObjectExpression).get(0).node
  if (!metadataObject) {
    console.error('Could not find metadata object')
    return
  }

  let metadataProperties = metadataObject.properties
  let viewportProperties

  const viewport = metadataProperties.find(
    (prop) => prop.key.name === 'viewport'
  )
  if (viewport) {
    viewportProperties = viewport.value.properties
    metadataProperties = metadataProperties.filter(
      (prop) => prop.key.name !== 'viewport'
    )
  } else {
    viewportProperties = []
  }

  const colorScheme = metadataProperties.find(
    (prop) => prop.key.name === 'colorScheme'
  )
  if (colorScheme) {
    viewportProperties.push(colorScheme)
    metadataProperties = metadataProperties.filter(
      (prop) => prop.key.name !== 'colorScheme'
    )
  }

  const themeColor = metadataProperties.find(
    (prop) => prop.key.name === 'themeColor'
  )
  if (themeColor) {
    viewportProperties.push(themeColor)
    metadataProperties = metadataProperties.filter(
      (prop) => prop.key.name !== 'themeColor'
    )
  }

  // Update the metadata export
  metadataExport
    .find(j.ObjectExpression)
    .replaceWith(j.objectExpression(metadataProperties))

  // Create the new viewport object
  const viewportExport = j.exportNamedDeclaration(
    j.variableDeclaration('const', [
      j.variableDeclarator(
        j.identifier('viewport'),
        j.objectExpression(viewportProperties)
      ),
    ])
  )

  // Append the viewport export to the body of the program
  if (viewportProperties.length) {
    root.get().node.program.body.push(viewportExport)
  }

  return root.toSource()
}
