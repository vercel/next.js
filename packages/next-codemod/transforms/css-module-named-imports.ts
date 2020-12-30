export default function (fileInfo, api) {
  const j = api.jscodeshift
  const root = j(fileInfo.source)
  const defaultImports = root.find(j.ImportDeclaration)

  function isModule(source) {
    return (
      source.value.endsWith('.module.css') ||
      source.value.endsWith('module.scss')
    )
  }

  defaultImports.forEach((rule) => {
    const { specifiers, source } = rule.value
    if (
      specifiers.length === 1 &&
      specifiers[0].type === 'ImportDefaultSpecifier' &&
      isModule(source)
    ) {
      const localImportName = specifiers[0].local.name
      j(rule).replaceWith(
        j.importDeclaration(
          [j.importNamespaceSpecifier(j.identifier(localImportName))],
          source
        )
      )
    }
  })

  return root.toSource()
}
