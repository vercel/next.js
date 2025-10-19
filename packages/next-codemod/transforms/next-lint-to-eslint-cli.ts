import { existsSync, readFileSync, writeFileSync, unlinkSync } from 'node:fs'
import path from 'node:path'
import { execSync } from 'node:child_process'
import { getPkgManager, installPackages } from '../lib/handle-package'
import { createParserFromPath } from '../lib/parser'
import { white, bold, red, yellow, green, magenta } from 'picocolors'

export const prefixes = {
  wait: white(bold('○')),
  error: red(bold('⨯')),
  warn: yellow(bold('⚠')),
  ready: '▲', // no color
  info: white(bold(' ')),
  event: green(bold('✓')),
  trace: magenta(bold('»')),
} as const

interface TransformerOptions {
  skipInstall?: boolean
  [key: string]: unknown
}

const ESLINT_CONFIG_TEMPLATE_TYPESCRIPT = `import nextCoreWebVitals from "eslint-config-next/core-web-vitals";
import nextTypescript from "eslint-config-next/typescript";

const eslintConfig = [
  ...nextCoreWebVitals,
  ...nextTypescript,
  {
    ignores: [
      "node_modules/**",
      ".next/**",
      "out/**",
      "build/**",
      "next-env.d.ts",
    ],
  },
];

export default eslintConfig;
`

const ESLINT_CONFIG_TEMPLATE_JAVASCRIPT = `import nextCoreWebVitals from "eslint-config-next/core-web-vitals";

const eslintConfig = [
  ...nextCoreWebVitals,
  {
    ignores: [
      "node_modules/**",
      ".next/**",
      "out/**",
      "build/**",
      "next-env.d.ts",
    ],
  },
];

export default eslintConfig;
`

function detectTypeScript(projectRoot: string): boolean {
  return existsSync(path.join(projectRoot, 'tsconfig.json'))
}

function findExistingEslintConfig(projectRoot: string): {
  exists: boolean
  path: string | null
  isLegacy: boolean | null
} {
  const flatConfigs = [
    'eslint.config.js',
    'eslint.config.mjs',
    'eslint.config.cjs',
    'eslint.config.ts',
    'eslint.config.mts',
    'eslint.config.cts',
  ]

  const legacyConfigs = [
    '.eslintrc.js',
    '.eslintrc.cjs',
    '.eslintrc.yaml',
    '.eslintrc.yml',
    '.eslintrc.json',
    '.eslintrc',
  ]

  // Check for flat configs first (preferred for v9+)
  for (const config of flatConfigs) {
    const configPath = path.join(projectRoot, config)
    if (existsSync(configPath)) {
      return { exists: true, path: configPath, isLegacy: false }
    }
  }

  // Check for legacy configs
  for (const config of legacyConfigs) {
    const configPath = path.join(projectRoot, config)
    if (existsSync(configPath)) {
      return { exists: true, path: configPath, isLegacy: true }
    }
  }

  return { exists: false, path: null, isLegacy: null }
}

function replaceFlatCompatInConfig(configPath: string): boolean {
  let configContent: string
  try {
    configContent = readFileSync(configPath, 'utf8')
  } catch (error) {
    console.error(`   Error reading config file: ${error}`)
    return false
  }

  // Check if FlatCompat is used
  const hasFlatCompat =
    configContent.includes('FlatCompat') ||
    configContent.includes('@eslint/eslintrc')

  if (!hasFlatCompat) {
    console.log('   No FlatCompat usage found, no changes needed')
    return false
  }

  // Parse the file using jscodeshift
  const j = createParserFromPath(configPath)
  const root = j(configContent)

  // Track if we need to add imports and preserve other configs
  let needsNextVitals = false
  let needsNextTs = false
  let otherConfigs: string[] = []

  // Look for FlatCompat extends usage and identify which configs are being used
  root.find(j.CallExpression).forEach((astPath) => {
    const node = astPath.value

    // Detect compat.extends() calls and identify which configs are being used
    if (
      node.callee.type === 'MemberExpression' &&
      (node.callee as any).object.type === 'Identifier' &&
      (node.callee as any).object.name === 'compat' &&
      (node.callee as any).property.type === 'Identifier' &&
      (node.callee as any).property.name === 'extends'
    ) {
      // Check arguments for all configs
      node.arguments.forEach((arg: any) => {
        if (arg.type === 'Literal' || arg.type === 'StringLiteral') {
          if (arg.value === 'next/core-web-vitals') {
            needsNextVitals = true
          } else if (arg.value === 'next/typescript') {
            needsNextTs = true
          } else if (typeof arg.value === 'string') {
            // Preserve other configs (non-Next.js or other Next.js variants)
            otherConfigs.push(arg.value)
          }
        }
      })
    }

    // Detect compat.config({ extends: [...] }) calls and identify which configs are being used
    if (
      node.callee.type === 'MemberExpression' &&
      (node.callee as any).object.type === 'Identifier' &&
      (node.callee as any).object.name === 'compat' &&
      (node.callee as any).property.type === 'Identifier' &&
      (node.callee as any).property.name === 'config'
    ) {
      // Look for extends property in the object argument
      node.arguments.forEach((arg: any) => {
        if (arg.type === 'ObjectExpression') {
          arg.properties?.forEach((prop: any) => {
            if (
              prop.type === 'ObjectProperty' &&
              prop.key.type === 'Identifier' &&
              prop.key.name === 'extends' &&
              prop.value.type === 'ArrayExpression'
            ) {
              // Process the extends array
              prop.value.elements?.forEach((element: any) => {
                if (
                  element.type === 'Literal' ||
                  element.type === 'StringLiteral'
                ) {
                  if (element.value === 'next/core-web-vitals') {
                    needsNextVitals = true
                  } else if (element.value === 'next/typescript') {
                    needsNextTs = true
                  } else if (typeof element.value === 'string') {
                    // Preserve other configs (non-Next.js or other Next.js variants)
                    otherConfigs.push(element.value)
                  }
                }
              })
            }
          })
        }
      })
    }
  })

  if (!needsNextVitals && !needsNextTs && otherConfigs.length === 0) {
    console.warn(
      prefixes.warn,
      '   No ESLint configs found in FlatCompat usage'
    )
    return false
  }

  if (!needsNextVitals && !needsNextTs) {
    console.log('   No Next.js configs found, but preserving other configs')
  }

  // Only remove FlatCompat setup if no other configs need it
  if (otherConfigs.length === 0) {
    // Remove FlatCompat imports and setup
    root.find(j.ImportDeclaration).forEach((astPath) => {
      const node = astPath.value
      if (
        node.source.value === '@eslint/eslintrc' ||
        node.source.value === '@eslint/js'
      ) {
        // Only remove FlatCompat-specific imports
        j(astPath).remove()
      }
      // Leave path/url imports alone - they might be used elsewhere
    })

    // Remove only the compat variable - keep __dirname and __filename
    root.find(j.VariableDeclaration).forEach((astPath) => {
      const node = astPath.value
      if (node.declarations) {
        // Filter out only the compat variable
        const filteredDeclarations = node.declarations.filter((decl: any) => {
          if (decl && decl.id && decl.id.type === 'Identifier') {
            return decl.id.name !== 'compat'
          }
          return true
        })

        if (filteredDeclarations.length === 0) {
          // Remove entire declaration if no declarations left
          j(astPath).remove()
        } else if (filteredDeclarations.length < node.declarations.length) {
          // Update declaration with filtered declarations
          node.declarations = filteredDeclarations
        }
      }
    })
  } else {
    console.log('   Preserving FlatCompat setup for other ESLint configs')
  }

  // Add new imports after the eslint/config import
  const imports = []

  // Add imports in correct order: core-web-vitals first, then typescript
  if (needsNextVitals) {
    imports.push(
      j.importDeclaration(
        [j.importDefaultSpecifier(j.identifier('nextCoreWebVitals'))],
        j.literal('eslint-config-next/core-web-vitals')
      )
    )
  }

  if (needsNextTs) {
    imports.push(
      j.importDeclaration(
        [j.importDefaultSpecifier(j.identifier('nextTypescript'))],
        j.literal('eslint-config-next/typescript')
      )
    )
  }

  // Find the eslint/config import and insert our imports after it
  let eslintConfigImportPath = null
  root.find(j.ImportDeclaration).forEach((astPath) => {
    if (astPath.value.source.value === 'eslint/config') {
      eslintConfigImportPath = astPath
    }
  })

  // Insert imports after eslint/config import (or at beginning if not found)
  if (eslintConfigImportPath) {
    // Insert after the eslint/config import in correct order
    for (let i = imports.length - 1; i >= 0; i--) {
      eslintConfigImportPath.insertAfter(imports[i])
    }
  } else {
    // Fallback: insert at the beginning in correct order
    const program = root.find(j.Program)
    for (let i = imports.length - 1; i >= 0; i--) {
      program.get('body', 0).insertBefore(imports[i])
    }
  }

  // Replace FlatCompat extends with spread imports
  root.find(j.SpreadElement).forEach((astPath) => {
    const node = astPath.value

    // Replace spread of compat.extends(...) calls with direct imports
    if (
      node.argument.type === 'CallExpression' &&
      node.argument.callee.type === 'MemberExpression' &&
      node.argument.callee.object.type === 'Identifier' &&
      node.argument.callee.object.name === 'compat' &&
      node.argument.callee.property.type === 'Identifier' &&
      node.argument.callee.property.name === 'extends'
    ) {
      // Replace with spread of direct imports and preserve other configs
      const replacements = []
      node.argument.arguments.forEach((arg: any) => {
        if (arg.type === 'Literal' || arg.type === 'StringLiteral') {
          if (arg.value === 'next/core-web-vitals') {
            replacements.push(
              j.spreadElement(j.identifier('nextCoreWebVitals'))
            )
          } else if (arg.value === 'next/typescript') {
            replacements.push(j.spreadElement(j.identifier('nextTypescript')))
          } else if (typeof arg.value === 'string') {
            // Preserve other configs as compat.extends() calls
            replacements.push(
              j.spreadElement(
                j.callExpression(
                  j.memberExpression(
                    j.identifier('compat'),
                    j.identifier('extends')
                  ),
                  [j.literal(arg.value)]
                )
              )
            )
          }
        }
      })

      if (replacements.length > 0) {
        // Replace the current spread element with multiple spread elements
        const parent = astPath.parent
        if (parent.value.type === 'ArrayExpression') {
          const index = parent.value.elements.indexOf(node)
          if (index !== -1) {
            parent.value.elements.splice(index, 1, ...replacements)
          }
        }
      }
    }

    // Replace spread of compat.config({ extends: [...] }) calls with direct imports
    if (
      node.argument.type === 'CallExpression' &&
      node.argument.callee.type === 'MemberExpression' &&
      node.argument.callee.object.type === 'Identifier' &&
      node.argument.callee.object.name === 'compat' &&
      node.argument.callee.property.type === 'Identifier' &&
      node.argument.callee.property.name === 'config'
    ) {
      const replacements = []
      const preservedConfigs = []

      // Process each argument to compat.config
      node.argument.arguments.forEach((arg: any) => {
        if (arg.type === 'ObjectExpression') {
          const updatedProperties = []

          arg.properties?.forEach((prop: any) => {
            if (
              prop.type === 'ObjectProperty' &&
              prop.key.type === 'Identifier' &&
              prop.key.name === 'extends' &&
              prop.value.type === 'ArrayExpression'
            ) {
              const nonNextConfigs = []

              // Process extends array
              prop.value.elements?.forEach((element: any) => {
                if (
                  element.type === 'Literal' ||
                  element.type === 'StringLiteral'
                ) {
                  if (element.value === 'next/core-web-vitals') {
                    replacements.push(
                      j.spreadElement(j.identifier('nextCoreWebVitals'))
                    )
                  } else if (element.value === 'next/typescript') {
                    replacements.push(
                      j.spreadElement(j.identifier('nextTypescript'))
                    )
                  } else if (typeof element.value === 'string') {
                    // Keep non-Next.js configs
                    nonNextConfigs.push(element)
                  }
                }
              })

              // If there are non-Next.js configs, preserve the extends property with them
              if (nonNextConfigs.length > 0) {
                updatedProperties.push(
                  j.property(
                    'init',
                    j.identifier('extends'),
                    j.arrayExpression(nonNextConfigs)
                  )
                )
              }
            } else {
              // Preserve other properties (not extends)
              updatedProperties.push(prop)
            }
          })

          // If we still have properties to preserve, keep the compat.config call
          if (updatedProperties.length > 0) {
            preservedConfigs.push(
              j.spreadElement(
                j.callExpression(
                  j.memberExpression(
                    j.identifier('compat'),
                    j.identifier('config')
                  ),
                  [j.objectExpression(updatedProperties)]
                )
              )
            )
          }
        }
      })

      // Add all replacements
      const allReplacements = [...replacements, ...preservedConfigs]

      if (allReplacements.length > 0) {
        // Replace the current spread element with multiple spread elements
        const parent = astPath.parent
        if (parent.value.type === 'ArrayExpression') {
          const index = parent.value.elements.indexOf(node)
          if (index !== -1) {
            parent.value.elements.splice(index, 1, ...allReplacements)
          }
        }
      }
    }
  })

  // Also handle the case where extends is used as a property value (not spread)
  root.find(j.ObjectExpression).forEach((astPath) => {
    const objectNode = astPath.value
    objectNode.properties?.forEach((prop: any) => {
      if (
        prop.type === 'ObjectProperty' &&
        prop.key.type === 'Identifier' &&
        prop.key.name === 'extends' &&
        prop.value.type === 'CallExpression' &&
        prop.value.callee.type === 'MemberExpression' &&
        prop.value.callee.object.type === 'Identifier' &&
        prop.value.callee.object.name === 'compat' &&
        prop.value.callee.property.type === 'Identifier' &&
        prop.value.callee.property.name === 'extends'
      ) {
        // Replace with array of spread imports and preserve other configs
        const replacements = []
        prop.value.arguments.forEach((arg: any) => {
          if (arg.type === 'Literal' || arg.type === 'StringLiteral') {
            if (arg.value === 'next/core-web-vitals') {
              replacements.push(
                j.spreadElement(j.identifier('nextCoreWebVitals'))
              )
            } else if (arg.value === 'next/typescript') {
              replacements.push(j.spreadElement(j.identifier('nextTypescript')))
            } else if (typeof arg.value === 'string') {
              // Preserve other configs as compat.extends() calls
              replacements.push(
                j.spreadElement(
                  j.callExpression(
                    j.memberExpression(
                      j.identifier('compat'),
                      j.identifier('extends')
                    ),
                    [j.literal(arg.value)]
                  )
                )
              )
            }
          }
        })

        if (replacements.length > 0) {
          // Replace the property value with an array of spreads
          prop.value = j.arrayExpression(replacements)
        }
      }
    })
  })

  // Generate the updated code
  const updatedContent = root.toSource()

  if (updatedContent !== configContent) {
    // Validate the generated code by parsing it
    try {
      const validateJ = createParserFromPath(configPath)
      validateJ(updatedContent) // This will throw if the syntax is invalid
    } catch (parseError) {
      console.error(
        `   Generated code has invalid syntax: ${parseError instanceof Error ? parseError.message : parseError}`
      )
      console.error('   Skipping update to prevent breaking the config file')
      return false
    }

    // Create backup of original file
    const backupPath = `${configPath}.backup-${Date.now()}`
    try {
      writeFileSync(backupPath, configContent)
    } catch (backupError) {
      console.warn(`   Warning: Could not create backup file: ${backupError}`)
    }

    try {
      writeFileSync(configPath, updatedContent)
      console.log(
        `   Updated ${path.basename(configPath)} to use direct eslint-config-next imports`
      )

      // Remove backup on success
      try {
        if (existsSync(backupPath)) {
          unlinkSync(backupPath)
        }
      } catch (cleanupError) {
        console.warn(
          `   Warning: Could not remove backup file ${backupPath}: ${cleanupError}`
        )
      }

      return true
    } catch (error) {
      console.error(`   Error writing config file: ${error}`)

      // Restore from backup on failure
      try {
        if (existsSync(backupPath)) {
          writeFileSync(configPath, readFileSync(backupPath, 'utf8'))
          console.log('   Restored original config from backup')
        }
      } catch (restoreError) {
        console.error(`   Error restoring backup: ${restoreError}`)
      }

      return false
    }
  }

  return true
}

function updateExistingFlatConfig(
  configPath: string,
  isTypeScript: boolean = false
): boolean {
  let configContent: string
  try {
    configContent = readFileSync(configPath, 'utf8')
  } catch (error) {
    console.error(`   Error reading config file: ${error}`)
    return false
  }

  // Check if Next.js configs are already imported directly
  const hasNextVitals = configContent.includes(
    'eslint-config-next/core-web-vitals'
  )
  const hasNextTs = configContent.includes('eslint-config-next/typescript')
  const hasNextConfigs = hasNextVitals || hasNextTs

  // Parse the file using jscodeshift
  const j = createParserFromPath(configPath)
  const root = j(configContent)

  // Find the exported array - support different export patterns
  let exportedArray = null

  // Pattern 1: export default [...]
  const directArrayExports = root.find(j.ExportDefaultDeclaration, {
    declaration: { type: 'ArrayExpression' },
  })

  if (directArrayExports.size() > 0) {
    exportedArray = directArrayExports.at(0).get('declaration')
  } else {
    // Pattern 2: const config = [...]; export default config
    const defaultExportIdentifier = root.find(j.ExportDefaultDeclaration, {
      declaration: { type: 'Identifier' },
    })

    if (defaultExportIdentifier.size() > 0) {
      const declarationNode = defaultExportIdentifier.at(0).get('declaration')
      if (declarationNode.value) {
        const varName = declarationNode.value.name
        const varDeclaration = root.find(j.VariableDeclarator, {
          id: { name: varName },
          init: { type: 'ArrayExpression' },
        })

        if (varDeclaration.size() > 0) {
          exportedArray = varDeclaration.at(0).get('init')
        } else {
          // Pattern 3: defineConfig([...]) or similar wrapper function
          const callDeclaration = root.find(j.VariableDeclarator, {
            id: { name: varName },
            init: { type: 'CallExpression' },
          })

          if (callDeclaration.size() > 0) {
            const callExpression = callDeclaration.at(0).get('init')
            if (
              callExpression.value.arguments.length > 0 &&
              callExpression.value.arguments[0].type === 'ArrayExpression'
            ) {
              exportedArray = callExpression.get('arguments', 0)
            } else {
              console.warn(
                prefixes.warn,
                '   Wrapper function does not have an array parameter. Manual migration required.'
              )
              return false
            }
          }
        }
      }
    }
  }

  if (!exportedArray) {
    console.warn(
      prefixes.warn,
      '   Config does not export an array or supported pattern. Manual migration required.'
    )
    return false
  }

  // Add Next.js imports if not present
  const program = root.find(j.Program)
  const imports = []

  if (!hasNextVitals) {
    imports.push(
      j.importDeclaration(
        [j.importDefaultSpecifier(j.identifier('nextCoreWebVitals'))],
        j.literal('eslint-config-next/core-web-vitals')
      )
    )
  }

  if (!hasNextTs && isTypeScript) {
    imports.push(
      j.importDeclaration(
        [j.importDefaultSpecifier(j.identifier('nextTypescript'))],
        j.literal('eslint-config-next/typescript')
      )
    )
  }

  // Insert imports at the beginning in correct order
  for (let i = imports.length - 1; i >= 0; i--) {
    program.get('body', 0).insertBefore(imports[i])
  }

  // Add spread elements to config array if not already present
  if (!exportedArray.value.elements) {
    exportedArray.value.elements = []
  }

  const spreadsToAdd = []
  if (!hasNextVitals) {
    spreadsToAdd.push(j.spreadElement(j.identifier('nextCoreWebVitals')))
  }
  if (!hasNextTs && isTypeScript) {
    spreadsToAdd.push(j.spreadElement(j.identifier('nextTypescript')))
  }

  // Insert at the beginning of array in correct order
  for (let i = spreadsToAdd.length - 1; i >= 0; i--) {
    exportedArray.value.elements.unshift(spreadsToAdd[i])
  }

  // Add ignores config if not already present
  const hasIgnores = exportedArray.value.elements.some(
    (element) =>
      element &&
      element.type === 'ObjectExpression' &&
      element.properties &&
      element.properties.some(
        (prop) =>
          prop.type === 'ObjectProperty' &&
          prop.key &&
          prop.key.type === 'Identifier' &&
          prop.key.name === 'ignores'
      )
  )

  if (!hasIgnores) {
    const ignoresConfig = j.objectExpression([
      j.property(
        'init',
        j.identifier('ignores'),
        j.arrayExpression([
          j.literal('node_modules/**'),
          j.literal('.next/**'),
          j.literal('out/**'),
          j.literal('build/**'),
          j.literal('next-env.d.ts'),
        ])
      ),
    ])
    exportedArray.value.elements.push(ignoresConfig)
  }

  // Generate the updated code
  const updatedContent = root.toSource()

  if (updatedContent !== configContent) {
    // Validate the generated code by parsing it
    try {
      const validateJ = createParserFromPath(configPath)
      validateJ(updatedContent) // This will throw if the syntax is invalid
    } catch (parseError) {
      console.error(
        `   Generated code has invalid syntax: ${parseError instanceof Error ? parseError.message : parseError}`
      )
      console.error('   Skipping update to prevent breaking the config file')
      return false
    }

    // Create backup of original file
    const backupPath = `${configPath}.backup-${Date.now()}`
    try {
      writeFileSync(backupPath, configContent)
    } catch (backupError) {
      console.warn(`   Warning: Could not create backup file: ${backupError}`)
    }

    try {
      writeFileSync(configPath, updatedContent)
      console.log(
        `   Updated ${path.basename(configPath)} with Next.js configurations`
      )

      // Remove backup on success
      try {
        if (existsSync(backupPath)) {
          unlinkSync(backupPath)
        }
      } catch (cleanupError) {
        console.warn(
          `   Warning: Could not remove backup file ${backupPath}: ${cleanupError}`
        )
      }

      return true
    } catch (error) {
      console.error(`   Error writing config file: ${error}`)

      // Restore from backup on failure
      try {
        if (existsSync(backupPath)) {
          writeFileSync(configPath, readFileSync(backupPath, 'utf8'))
          console.log('   Restored original config from backup')
        }
      } catch (restoreError) {
        console.error(`   Error restoring backup: ${restoreError}`)
      }

      return false
    }
  }

  // If nothing changed but configs are present, that's still success
  if (hasNextConfigs) {
    console.log('   Next.js ESLint configs already present in flat config')
    return true
  }

  return true
}

function updatePackageJsonScripts(packageJsonContent: string): {
  updated: boolean
  content: string
} {
  try {
    const packageJson = JSON.parse(packageJsonContent)
    let needsUpdate = false

    if (!packageJson.scripts) {
      packageJson.scripts = {}
    }

    // Process all scripts that contain "next lint"
    for (const scriptName in packageJson.scripts) {
      const scriptValue = packageJson.scripts[scriptName]
      if (
        typeof scriptValue === 'string' &&
        scriptValue.includes('next lint')
      ) {
        // Replace "next lint" with "eslint" and handle special arguments
        const updatedScript = scriptValue.replace(
          /\bnext\s+lint\b([^&|;]*)/gi,
          (_match, args = '') => {
            // Track whether we need a trailing space before operators
            let trailingSpace = ''
            if (args.endsWith(' ')) {
              trailingSpace = ' '
              args = args.trimEnd()
            }

            // Check for redirects (2>, 1>, etc.) and preserve them
            let redirect = ''
            const redirectMatch = args.match(/\s+(\d*>[>&]?.*)$/)
            if (redirectMatch) {
              redirect = ` ${redirectMatch[1]}`
              args = args.substring(0, redirectMatch.index)
            }

            // Parse arguments - handle quoted strings properly
            const argTokens = []
            let current = ''
            let inQuotes = false
            let quoteChar = ''

            for (let j = 0; j < args.length; j++) {
              const char = args[j]
              if (
                (char === '"' || char === "'") &&
                (j === 0 || args[j - 1] !== '\\')
              ) {
                if (!inQuotes) {
                  inQuotes = true
                  quoteChar = char
                  current += char
                } else if (char === quoteChar) {
                  inQuotes = false
                  quoteChar = ''
                  current += char
                } else {
                  current += char
                }
              } else if (char === ' ' && !inQuotes) {
                if (current) {
                  argTokens.push(current)
                  current = ''
                }
              } else {
                current += char
              }
            }
            if (current) {
              argTokens.push(current)
            }

            const eslintArgs = []
            const paths = []

            for (let i = 0; i < argTokens.length; i++) {
              const token = argTokens[i]

              if (token === '--strict') {
                eslintArgs.push('--max-warnings', '0')
              } else if (token === '--dir' && i + 1 < argTokens.length) {
                paths.push(argTokens[++i])
              } else if (token === '--file' && i + 1 < argTokens.length) {
                paths.push(argTokens[++i])
              } else if (token === '--rulesdir' && i + 1 < argTokens.length) {
                // Skip rulesdir and its value
                i++
              } else if (token === '--ext' && i + 1 < argTokens.length) {
                // Skip ext and its value
                i++
              } else if (token.startsWith('--')) {
                // Keep other flags and their values
                eslintArgs.push(token)
                if (
                  i + 1 < argTokens.length &&
                  !argTokens[i + 1].startsWith('--')
                ) {
                  eslintArgs.push(argTokens[++i])
                }
              } else {
                // Positional arguments (paths)
                paths.push(token)
              }
            }

            // Build the result
            let result = 'eslint'
            if (eslintArgs.length > 0) {
              result += ` ${eslintArgs.join(' ')}`
            }

            // Add paths or default to .
            if (paths.length > 0) {
              result += ` ${paths.join(' ')}`
            } else {
              result += ' .'
            }

            // Add redirect if present
            result += redirect

            // Add back trailing space if we had one
            result += trailingSpace

            return result
          }
        )

        if (updatedScript !== scriptValue) {
          packageJson.scripts[scriptName] = updatedScript
          needsUpdate = true
          console.log(
            `   Updated script "${scriptName}": "${scriptValue}" → "${updatedScript}"`
          )

          // Note about unsupported flags
          if (scriptValue.includes('--rulesdir')) {
            console.log(`   Note: --rulesdir is not supported in ESLint v9`)
          }
          if (scriptValue.includes('--ext')) {
            console.log(`   Note: --ext is not needed in ESLint v9 flat config`)
          }
        }
      }
    }

    // Ensure required devDependencies exist
    if (!packageJson.devDependencies) {
      packageJson.devDependencies = {}
    }

    // Check if eslint exists in either dependencies or devDependencies
    if (
      !packageJson.devDependencies.eslint &&
      !packageJson.dependencies?.eslint
    ) {
      packageJson.devDependencies.eslint = '^9'
      needsUpdate = true
    }

    // Check if eslint-config-next exists in either dependencies or devDependencies
    if (
      !packageJson.devDependencies['eslint-config-next'] &&
      !packageJson.dependencies?.['eslint-config-next']
    ) {
      // Use the same version as next if available
      const nextVersion =
        packageJson.dependencies?.next || packageJson.devDependencies?.next
      packageJson.devDependencies['eslint-config-next'] =
        nextVersion || 'latest'
      needsUpdate = true
    }

    // Remove @eslint/eslintrc if it exists since we no longer use FlatCompat
    if (packageJson.devDependencies?.['@eslint/eslintrc']) {
      delete packageJson.devDependencies['@eslint/eslintrc']
      needsUpdate = true
    }
    if (packageJson.dependencies?.['@eslint/eslintrc']) {
      delete packageJson.dependencies['@eslint/eslintrc']
      needsUpdate = true
    }

    const updatedContent = `${JSON.stringify(packageJson, null, 2)}\n`
    return { updated: needsUpdate, content: updatedContent }
  } catch (error) {
    console.error('Error updating package.json:', error)
    return { updated: false, content: packageJsonContent }
  }
}

export default function transformer(
  files: string[],
  options: TransformerOptions = {}
): void {
  // The codemod CLI passes arguments as an array for consistency with file-based transforms,
  // but project-level transforms like this one only process a single directory.
  // Usage: npx @next/codemod next-lint-to-eslint-cli <project-directory>
  const dir = files[0]
  if (!dir) {
    console.error('Error: Please specify a directory path')
    return
  }

  // Allow skipping installation via option
  const skipInstall = options.skipInstall === true

  const projectRoot = path.resolve(dir)
  const packageJsonPath = path.join(projectRoot, 'package.json')

  if (!existsSync(packageJsonPath)) {
    console.error('Error: package.json not found in the specified directory')
    return
  }

  const isTypeScript = detectTypeScript(projectRoot)

  console.log('Migrating from next lint to the ESLint CLI...')

  // Check for existing ESLint config
  const existingConfig = findExistingEslintConfig(projectRoot)

  // If no existing ESLint config found, create a new one.
  if (existingConfig.exists === false) {
    // Create new ESLint flat config
    const eslintConfigPath = path.join(projectRoot, 'eslint.config.mjs')
    const template = isTypeScript
      ? ESLINT_CONFIG_TEMPLATE_TYPESCRIPT
      : ESLINT_CONFIG_TEMPLATE_JAVASCRIPT

    try {
      writeFileSync(eslintConfigPath, template)
      console.log(`   Created ${path.basename(eslintConfigPath)}`)
    } catch (error) {
      console.error('   Error creating ESLint config:', error)
    }
  } else {
    let eslintConfigFilename = path.basename(existingConfig.path)
    let eslintConfigPath = existingConfig.path

    // If legacy config found, run ESLint migration tool first. It will
    // use FlatCompat, so will continue to migrate using Flat config format.
    if (existingConfig.isLegacy && existingConfig.path) {
      console.log(`   Found legacy ESLint config: ${eslintConfigFilename}`)

      // Run npx @eslint/migrate-config
      const command = `npx @eslint/migrate-config ${existingConfig.path}`
      console.log(`   Running "${command}" to convert legacy config...`)
      try {
        execSync(command, {
          cwd: projectRoot,
          stdio: 'pipe',
        })

        // The migration tool creates eslint.config.mjs by default
        const outputPath = path.join(projectRoot, 'eslint.config.mjs')
        if (!existsSync(outputPath)) {
          throw new Error(
            `Failed to find the expected output file "${outputPath}" generated by the migration tool.`
          )
        }

        // Use generated config will have FlatCompat, so continue to apply
        // the next steps to it.
        eslintConfigPath = outputPath
        eslintConfigFilename = path.basename(eslintConfigPath)
      } catch (cause) {
        throw new Error(
          `Failed to run "${command}" to migrate the legacy ESLint config "${eslintConfigFilename}".\n` +
            `Please try the migration to Flat config manually.\n` +
            `Learn more: https://eslint.org/docs/latest/use/configure/migration-guide`,
          { cause }
        )
      }
    }

    console.log(`   Found existing ESLint Flat config: ${eslintConfigFilename}`)

    // First try to replace FlatCompat usage if present
    replaceFlatCompatInConfig(eslintConfigPath)

    // Always try to update flat config with Next.js configurations
    // regardless of whether FlatCompat was found
    const updated = updateExistingFlatConfig(eslintConfigPath, isTypeScript)

    if (!updated) {
      console.log('   Could not automatically update the existing flat config.')
      console.log(
        '   Please manually ensure your ESLint config includes the Next.js configurations'
      )
    }
  }

  const packageJsonContent = readFileSync(packageJsonPath, 'utf8')
  const result = updatePackageJsonScripts(packageJsonContent)

  if (result.updated) {
    try {
      writeFileSync(packageJsonPath, result.content)
      console.log('Updated package.json scripts and dependencies')

      // Parse the updated package.json to find new dependencies
      const updatedPackageJson = JSON.parse(result.content)
      const originalPackageJson = JSON.parse(packageJsonContent)

      const newDependencies: string[] = []

      // Check for new devDependencies
      if (updatedPackageJson.devDependencies) {
        for (const [pkg, version] of Object.entries(
          updatedPackageJson.devDependencies
        )) {
          if (
            !originalPackageJson.devDependencies?.[pkg] &&
            !originalPackageJson.dependencies?.[pkg]
          ) {
            newDependencies.push(`${pkg}@${version}`)
          }
        }
      }

      // Install new dependencies if any were added
      if (newDependencies.length > 0) {
        if (skipInstall) {
          console.log('\nNew dependencies added to package.json:')
          newDependencies.forEach((dep) => console.log(`   - ${dep}`))
          console.log(`Please run: ${getPkgManager(projectRoot)} install`)
        } else {
          console.log('\nInstalling new dependencies...')
          try {
            const packageManager = getPkgManager(projectRoot)
            console.log(`   Using ${packageManager}...`)

            installPackages(newDependencies, {
              packageManager,
              dev: true,
              silent: false,
            })

            console.log('   Dependencies installed successfully!')
          } catch (_error) {
            console.error('   Failed to install dependencies automatically.')
            console.error(
              `   Please run: ${getPkgManager(projectRoot)} install`
            )
          }
        }
      }
    } catch (error) {
      console.error('Error writing package.json:', error)
    }
  }

  console.log('\nMigration complete! Your project now uses the ESLint CLI.')
}
