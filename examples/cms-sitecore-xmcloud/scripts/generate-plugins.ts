import fs from "fs";
import path from "path";
import { getItems } from "./utils";

/*
  PLUGINS GENERATION
  NOTE: pluginName: the name of the plugin in the src/lib folder
  Generates the `/src/temp/{pluginName}-plugins.ts` file, which exports list of plugins

  Generating the plugins is optional, and it can be maintained manually if preferred.

  The default convention uses the plugin's filename (without the extension) as the first part of the component
  name. For example, the file `/lib/page-props-factory/plugins/exampleName.ts` would map to plugin `exampleNamePlugin`.
  This can be customized in writePlugins().
*/

enum ModuleType {
  CJS,
  ESM,
}

interface PluginDefinition {
  listPath: string;
  rootPath: string;
  moduleType: ModuleType;
}

interface PluginFile {
  path: string;
  name: string;
}

const pluginDefinitions = [
  {
    listPath: "scripts/temp/config-plugins.ts",
    rootPath: "scripts/config/plugins",
    moduleType: ModuleType.ESM,
  },
  {
    listPath: "src/temp/sitemap-fetcher-plugins.ts",
    rootPath: "src/lib/sitemap-fetcher/plugins",
    moduleType: ModuleType.ESM,
  },
  {
    listPath: "src/temp/middleware-plugins.ts",
    rootPath: "src/lib/middleware/plugins",
    moduleType: ModuleType.ESM,
  },
  {
    listPath: "src/temp/page-props-factory-plugins.ts",
    rootPath: "src/lib/page-props-factory/plugins",
    moduleType: ModuleType.ESM,
  },
  {
    listPath: "src/temp/next-config-plugins.js",
    rootPath: "src/lib/next-config/plugins",
    moduleType: ModuleType.CJS,
  },
  {
    listPath: "src/temp/extract-path-plugins.ts",
    rootPath: "src/lib/extract-path/plugins",
    moduleType: ModuleType.ESM,
  },
  {
    listPath: "src/temp/site-resolver-plugins.ts",
    rootPath: "src/lib/site-resolver/plugins",
    moduleType: ModuleType.ESM,
  },
];

function getPluginList(path: string, pluginName: string): PluginFile[] {
  const plugins = getItems<PluginFile>({
    path,
    resolveItem: (path, name) => ({
      path: `${path}/${name}`,
      name: `${name.replace(/-./g, (x) => x[1].toUpperCase())}Plugin`,
    }),
    cb: (name) => console.debug(`Registering ${pluginName} plugin ${name}`),
  });

  return plugins;
}

/**
 * Generates the plugins file and saves it to the filesystem.
 * By convention, we expect to find plugins under src/lib/{pluginName}/plugins/** (subfolders are
 * searched recursively). The filename, with extension and non-word characters
 * stripped, is used to identify the plugin's JavaScript module definition (for adding
 * new plugin to the factory).
 * Modify this function to use a different convention.
 */
function writePlugins(
  listPath: string,
  rootPath: string,
  moduleType: ModuleType,
) {
  const segments = rootPath.split("/");
  const pluginName = segments[segments.length - 2];
  const plugins = getPluginList(rootPath, pluginName);
  let fileContent = "";

  fileContent = plugins
    .map((plugin) => {
      return moduleType === ModuleType.CJS
        ? `exports.${plugin.name} = require('${plugin.path.replace(
            "src/",
            "../",
          )}');`
        : `export { ${plugin.name} } from '${plugin.path}';`;
    })
    .join("\r\n")
    .concat("\r\n");

  if (!plugins.length) {
    fileContent =
      moduleType === ModuleType.CJS
        ? "module.exports = {};\r\n"
        : "export {};\r\n";
  }

  const filePath = path.resolve(listPath);
  console.log(`Writing ${pluginName} plugins to ${filePath}`);
  fs.writeFileSync(filePath, fileContent, {
    encoding: "utf8",
  });
}

function run(definitions: PluginDefinition[]) {
  definitions.forEach((definition) => {
    writePlugins(
      definition.listPath,
      definition.rootPath,
      definition.moduleType,
    );
  });
}

run(pluginDefinitions);
