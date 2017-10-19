export default class HarmonyImportSpecifierDependencyTemplate {
  apply (dep, source) {
    const content = this.getContent(dep)
    source.replace(dep.range[0], dep.range[1] - 1, content)
  }

  getContent (dep) {
    const importedModule = dep.importDependency.module
    const defaultImport =
      dep.directImport &&
      dep.id === 'default' &&
      !(
        importedModule &&
        (!importedModule.meta || importedModule.meta.harmonyModule) &&
        !/node_modules/.test(importedModule.resource)
      )
    const shortHandPrefix = this.getShortHandPrefix(dep)
    const { importedVar } = dep
    const importedVarSuffix = this.getImportVarSuffix(
      dep,
      defaultImport,
      importedModule
    )

    if (dep.call && defaultImport) {
      return `${shortHandPrefix}${importedVar}_default()`
    }

    if (dep.call && dep.id) {
      return `${shortHandPrefix}Object(${importedVar}${importedVarSuffix})`
    }

    return `${shortHandPrefix}${importedVar}${importedVarSuffix}`
  }

  getImportVarSuffix (dep, defaultImport, importedModule) {
    if (defaultImport) {
      return '_default.a'
    }

    if (dep.id) {
      const used =
        importedModule && !/node_modules/.test(importedModule.resource)
          ? importedModule.isUsed(dep.id)
          : dep.id
      const optionalComment = dep.id !== used ? ` /* ${dep.id} */` : ''
      return `[${JSON.stringify(used)}${optionalComment}]`
    }

    return ''
  }

  getShortHandPrefix (dep) {
    if (!dep.shorthand) {
      return ''
    }

    return `${dep.name}: `
  }
}
