'use strict'

import HarmonyCompatibilityDependency from 'webpack/lib/dependencies/HarmonyCompatibilityDependency'
import HarmonyCompatibilityDependencyTemplate from '../dependencies/harmony-compatibility-template'

import WebpackConfigDependency from '../dependencies/webpack-config'

import HarmonyImportDependency from 'webpack/lib/dependencies/HarmonyImportDependency'
import HarmonyImportDependencyTemplate from '../dependencies/harmony-import-template'
import HarmonyImportSpecifierDependency from 'webpack/lib/dependencies/HarmonyImportSpecifierDependency'
import HarmonyImportSpecifierDependencyTemplate from '../dependencies/harmony-import-specifier-template'
import RequireContextDependency from 'webpack/lib/dependencies/RequireContextDependency'
import RequireContextDependencyTemplate from '../dependencies/require-context-template'
import CommonJsRequireDependency from 'webpack/lib/dependencies/CommonJsRequireDependency'
import ModuleDependencyTemplateAsName from '../dependencies/module-template-as-name'
import { nodeModuleName } from '../utils'

export default class ServerSourcePlugin {
  apply (compiler) {
    compiler.plugin('compilation', (compilation) => {
      compilation.plugin('before-module-assets', () => {
        // Swap out the templates for pertinent dependencies to render
        // node file system specific imports and exports
        const serverDependencyTemplates = new Map(
          compilation.dependencyTemplates
        )
        serverDependencyTemplates.set(
          WebpackConfigDependency,
          new WebpackConfigDependency.NodeTemplate()
        )
        serverDependencyTemplates.set(
          HarmonyCompatibilityDependency,
          new HarmonyCompatibilityDependencyTemplate()
        )
        serverDependencyTemplates.set(
          HarmonyImportDependency,
          new HarmonyImportDependencyTemplate()
        )
        serverDependencyTemplates.set(
          HarmonyImportSpecifierDependency,
          new HarmonyImportSpecifierDependencyTemplate()
        )
        serverDependencyTemplates.set(
          RequireContextDependency,
          new RequireContextDependencyTemplate()
        )
        serverDependencyTemplates.set(
          CommonJsRequireDependency,
          new ModuleDependencyTemplateAsName()
        )

        compilation.modules
          .filter(
            ({ rootModule, resource }) =>
              (rootModule || resource) && !/node_modules|next\.js\/dist\//.test(resource)
          )
          .forEach((module) => {
            const assetName = `dist/${nodeModuleName(module)}`

            module.assets = module.assets || {}

            module.assets[assetName] = module.source(
              serverDependencyTemplates,
              compilation.outputOptions,
              compilation.moduleTemplate.requestShortener
            )
          })
      })
    })
  }
};
