export interface ImportDeclarationOptions {
  useEarlyImport: boolean
}

export function createImportDeclarations(
  declarations: [varName: string, filePath: string, ...string[]][],
  options: ImportDeclarationOptions
): string {
  const { useEarlyImport } = options

  if (useEarlyImport && process.env.NODE_ENV === 'production') {
    // Evaluate the imported modules early in the generated code.
    return declarations
      .map(
        ([varName, modulePath]) =>
          `import * as ${varName}_ from ${JSON.stringify(
            modulePath
          )};\nconst ${varName} = () => ${varName}_;\n`
      )
      .join('')
  }

  // Lazily evaluate the imported modules in the generated code.
  return declarations
    .map(
      ([varName, modulePath]) =>
        `const ${varName} = () => import(/* webpackMode: "eager" */ ${JSON.stringify(
          modulePath
        )});\n`
    )
    .join('')
}
