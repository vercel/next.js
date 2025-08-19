import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
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

const ESLINT_CONFIG_TEMPLATE_TYPESCRIPT = `\
import { dirname } from "path";
import { fileURLToPath } from "url";
import { FlatCompat } from "@eslint/eslintrc";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const compat = new FlatCompat({
  baseDirectory: __dirname,
});

const eslintConfig = [
  ...compat.extends("next/core-web-vitals", "next/typescript"),
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

const ESLINT_CONFIG_TEMPLATE_JAVASCRIPT = `import { dirname } from "path";
import { fileURLToPath } from "url";
import { FlatCompat } from "@eslint/eslintrc";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const compat = new FlatCompat({
  baseDirectory: __dirname,
});

const eslintConfig = [
  ...compat.extends("next/core-web-vitals"),
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
  path?: string
  isFlat?: boolean
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
      return { exists: true, path: configPath, isFlat: true }
    }
  }

  // Check for legacy configs
  for (const config of legacyConfigs) {
    const configPath = path.join(projectRoot, config)
    if (existsSync(configPath)) {
      return { exists: true, path: configPath, isFlat: false }
    }
  }

  return { exists: false }
}

function updateExistingFlatConfig(
  configPath: string,
  isTypeScript: boolean
): boolean {
  let configContent: string
  try {
    configContent = readFileSync(configPath, 'utf8')
  } catch (error) {
    console.error(`   Error reading config file: ${error}`)
    return false
  }

  // Check if Next.js configs are already imported
  const hasNextConfigs =
    configContent.includes('next/core-web-vitals') ||
    configContent.includes('next/typescript')

  // TypeScript config files need special handling
  if (
    configPath.endsWith('.ts') ||
    configPath.endsWith('.mts') ||
    configPath.endsWith('.cts')
  ) {
    console.warn(
      prefixes.warn,
      '   TypeScript config files require manual migration'
    )
    console.log('   Please add the following to your config:')
    console.log('   - Import: import { FlatCompat } from "@eslint/eslintrc"')
    console.log(
      '   - Extend: ...compat.extends("next/core-web-vitals"' +
        (isTypeScript ? ', "next/typescript"' : '') +
        ')'
    )
    return false
  }

  // Parse the file using jscodeshift
  const j = createParserFromPath(configPath)
  const root = j(configContent)

  // Determine if it's CommonJS or ES modules
  let isCommonJS = false

  if (configPath.endsWith('.cjs')) {
    isCommonJS = true
  } else if (configPath.endsWith('.mjs')) {
    isCommonJS = false
  } else if (configPath.endsWith('.js')) {
    // For .js files, check package.json type field
    const projectRoot = path.dirname(configPath)
    const packageJsonPath = path.join(projectRoot, 'package.json')

    try {
      if (existsSync(packageJsonPath)) {
        const packageJson = JSON.parse(readFileSync(packageJsonPath, 'utf8'))
        isCommonJS = packageJson.type !== 'module'
      } else {
        // Default to CommonJS if no package.json found
        isCommonJS = true
      }
    } catch {
      // Default to CommonJS if package.json can't be read
      isCommonJS = true
    }

    // Always check file syntax to override package.json detection if needed
    // This handles cases where package.json doesn't specify type but file uses ES modules
    const hasESModuleSyntax =
      root.find(j.ExportDefaultDeclaration).size() > 0 ||
      root.find(j.ExportNamedDeclaration).size() > 0 ||
      root.find(j.ImportDeclaration).size() > 0

    const hasCommonJSSyntax =
      root
        .find(j.AssignmentExpression, {
          left: {
            type: 'MemberExpression',
            object: { name: 'module' },
            property: { name: 'exports' },
          },
        })
        .size() > 0

    // Override package.json detection based on actual syntax
    if (hasESModuleSyntax && !hasCommonJSSyntax) {
      isCommonJS = false
    } else if (hasCommonJSSyntax && !hasESModuleSyntax) {
      isCommonJS = true
    }
    // If both or neither are found, keep the package.json-based detection
  } else {
    // For other extensions (.ts, .mts, .cts), assume based on extension
    isCommonJS = configPath.endsWith('.cts')
  }

  // Find the exported array
  let exportedArray = null
  let exportNode = null

  if (isCommonJS) {
    // Look for module.exports = [...]
    const moduleExports = root.find(j.AssignmentExpression, {
      left: {
        type: 'MemberExpression',
        object: { name: 'module' },
        property: { name: 'exports' },
      },
      right: { type: 'ArrayExpression' },
    })

    if (moduleExports.size() > 0) {
      exportNode = moduleExports.at(0)
      exportedArray = exportNode.get('right')
    }
  } else {
    // Look for export default [...]
    const defaultExports = root.find(j.ExportDefaultDeclaration, {
      declaration: { type: 'ArrayExpression' },
    })

    if (defaultExports.size() > 0) {
      exportNode = defaultExports.at(0)
      exportedArray = exportNode.get('declaration')
    } else {
      // Look for const variable = [...]; export default variable
      const defaultExportIdentifier = root.find(j.ExportDefaultDeclaration, {
        declaration: { type: 'Identifier' },
      })

      if (defaultExportIdentifier.size() > 0) {
        const declarationNode = defaultExportIdentifier.at(0).get('declaration')
        if (!declarationNode.value) {
          return false
        }
        const varName = declarationNode.value.name
        const varDeclaration = root.find(j.VariableDeclarator, {
          id: { name: varName },
          init: { type: 'ArrayExpression' },
        })

        if (varDeclaration.size() > 0) {
          exportedArray = varDeclaration.at(0).get('init')
        }
      }
    }
  }

  if (!exportedArray) {
    console.warn(
      prefixes.warn,
      '   Config does not export an array. Manual migration required.'
    )
    console.warn(
      prefixes.warn,
      '   ESLint flat configs must export an array of configuration objects.'
    )
    return false
  }

  // Check if FlatCompat is already imported
  const hasFlatCompat = isCommonJS
    ? root
        .find(j.CallExpression, {
          callee: { name: 'require' },
          arguments: [{ value: '@eslint/eslintrc' }],
        })
        .size() > 0
    : root
        .find(j.ImportDeclaration, {
          source: { value: '@eslint/eslintrc' },
        })
        .size() > 0

  // Add necessary imports if not present and if we're adding Next.js extends
  if (!hasFlatCompat && !hasNextConfigs) {
    if (isCommonJS) {
      // Add CommonJS requires at the top
      const firstNode = root.find(j.Program).get('body', 0)
      const compatRequire = j.variableDeclaration('const', [
        j.variableDeclarator(
          j.objectPattern([
            j.property(
              'init',
              j.identifier('FlatCompat'),
              j.identifier('FlatCompat')
            ),
          ]),
          j.callExpression(j.identifier('require'), [
            j.literal('@eslint/eslintrc'),
          ])
        ),
      ])
      const pathRequire = j.variableDeclaration('const', [
        j.variableDeclarator(
          j.identifier('path'),
          j.callExpression(j.identifier('require'), [j.literal('path')])
        ),
      ])
      const compatNew = j.variableDeclaration('const', [
        j.variableDeclarator(
          j.identifier('compat'),
          j.newExpression(j.identifier('FlatCompat'), [
            j.objectExpression([
              j.property(
                'init',
                j.identifier('baseDirectory'),
                j.identifier('__dirname')
              ),
            ]),
          ])
        ),
      ])

      j(firstNode).insertBefore(compatRequire)
      j(firstNode).insertBefore(pathRequire)
      j(firstNode).insertBefore(compatNew)
    } else {
      // Add ES module imports
      const firstImport = root.find(j.ImportDeclaration).at(0)
      const insertPoint =
        firstImport.size() > 0
          ? firstImport
          : root.find(j.Program).get('body', 0)

      const imports = [
        j.importDeclaration(
          [j.importSpecifier(j.identifier('dirname'))],
          j.literal('path')
        ),
        j.importDeclaration(
          [j.importSpecifier(j.identifier('fileURLToPath'))],
          j.literal('url')
        ),
        j.importDeclaration(
          [j.importSpecifier(j.identifier('FlatCompat'))],
          j.literal('@eslint/eslintrc')
        ),
      ]

      const setupVars = [
        j.variableDeclaration('const', [
          j.variableDeclarator(
            j.identifier('__filename'),
            j.callExpression(j.identifier('fileURLToPath'), [
              j.memberExpression(
                j.memberExpression(
                  j.identifier('import'),
                  j.identifier('meta')
                ),
                j.identifier('url')
              ),
            ])
          ),
        ]),
        j.variableDeclaration('const', [
          j.variableDeclarator(
            j.identifier('__dirname'),
            j.callExpression(j.identifier('dirname'), [
              j.identifier('__filename'),
            ])
          ),
        ]),
        j.variableDeclaration('const', [
          j.variableDeclarator(
            j.identifier('compat'),
            j.newExpression(j.identifier('FlatCompat'), [
              j.objectExpression([
                j.property(
                  'init',
                  j.identifier('baseDirectory'),
                  j.identifier('__dirname')
                ),
              ]),
            ])
          ),
        ]),
      ]

      if (firstImport.size() > 0) {
        // Insert after the last import
        const lastImportPath = root.find(j.ImportDeclaration).at(-1).get()
        if (!lastImportPath) {
          // Fallback to inserting at the beginning
          const fallbackInsertPoint = root.find(j.Program).get('body', 0)
          imports.forEach((imp) => j(fallbackInsertPoint).insertBefore(imp))
          setupVars.forEach((v) => j(fallbackInsertPoint).insertBefore(v))
        } else {
          imports.forEach((imp) => j(lastImportPath).insertAfter(imp))
          setupVars.forEach((v) => j(lastImportPath).insertAfter(v))
        }
      } else {
        // Insert at the beginning
        imports.forEach((imp) => j(insertPoint).insertBefore(imp))
        setupVars.forEach((v) => j(insertPoint).insertBefore(v))
      }
    }
  }

  // Create ignores configuration object
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

  // Only add Next.js extends if they're not already present
  if (!hasNextConfigs) {
    // Add Next.js configs to the array
    const nextExtends = isTypeScript
      ? ['next/core-web-vitals', 'next/typescript']
      : ['next/core-web-vitals']

    const spreadElement = j.spreadElement(
      j.callExpression(
        j.memberExpression(j.identifier('compat'), j.identifier('extends')),
        nextExtends.map((ext) => j.literal(ext))
      )
    )

    // Insert Next.js extends at the beginning of the array
    if (!exportedArray.value.elements) {
      exportedArray.value.elements = []
    }
    exportedArray.value.elements.unshift(spreadElement)
  }

  // Check if ignores already exist in the config and merge if needed
  let existingIgnoresIndex = -1
  if (exportedArray.value.elements) {
    for (let i = 0; i < exportedArray.value.elements.length; i++) {
      const element = exportedArray.value.elements[i]
      if (
        element &&
        element.type === 'ObjectExpression' &&
        element.properties &&
        element.properties.some(
          (prop) =>
            prop.type === 'Property' &&
            prop.key &&
            prop.key.type === 'Identifier' &&
            prop.key.name === 'ignores'
        )
      ) {
        existingIgnoresIndex = i
        break
      }
    }
  }

  if (existingIgnoresIndex === -1) {
    // No existing ignores, add our own at appropriate position
    const insertIndex = hasNextConfigs ? 0 : 1
    exportedArray.value.elements.splice(insertIndex, 0, ignoresConfig)
  } else {
    // Merge with existing ignores
    const existingIgnoresArr =
      exportedArray.value.elements[existingIgnoresIndex]?.properties ?? []

    const ignoresProp = existingIgnoresArr.find(
      (prop) =>
        prop.type === 'Property' &&
        prop.key &&
        prop.key.type === 'Identifier' &&
        prop.key.name === 'ignores'
    )

    if (
      ignoresProp &&
      ignoresProp.value &&
      ignoresProp.value.type === 'ArrayExpression'
    ) {
      // Add our ignores to the existing array if they're not already there
      const nextIgnores = [
        'node_modules/**',
        '.next/**',
        'out/**',
        'build/**',
        'next-env.d.ts',
      ]

      const existingIgnores = ignoresProp.value.elements
        .map((el) => (el.type === 'Literal' ? el.value : null))
        .filter(Boolean)

      for (const ignore of nextIgnores) {
        if (!existingIgnores.includes(ignore)) {
          ignoresProp.value.elements.push(j.literal(ignore))
        }
      }
    }
  }

  // Generate the updated code
  const updatedContent = root.toSource()

  if (updatedContent !== configContent) {
    try {
      writeFileSync(configPath, updatedContent)
    } catch (error) {
      console.error(`   Error writing config file: ${error}`)
      return false
    }

    if (hasNextConfigs) {
      console.log(
        `   Updated ${path.basename(configPath)} with Next.js ignores configuration`
      )
    } else {
      console.log(
        `   Updated ${path.basename(configPath)} with Next.js ESLint configs`
      )
    }
    return true
  }

  // If nothing changed but Next.js configs were already present, that's still success
  if (hasNextConfigs) {
    console.log('   Next.js ESLint configs already present in flat config')
    return true
  }

  return false
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

    // Check if @eslint/eslintrc exists in either dependencies or devDependencies
    if (
      !packageJson.devDependencies['@eslint/eslintrc'] &&
      !packageJson.dependencies?.['@eslint/eslintrc']
    ) {
      packageJson.devDependencies['@eslint/eslintrc'] = '^3'
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

  if (existingConfig.exists) {
    if (existingConfig.isFlat) {
      // Try to update existing flat config
      if (existingConfig.path) {
        console.log(
          `   Found existing flat config: ${path.basename(existingConfig.path)}`
        )
        const updated = updateExistingFlatConfig(
          existingConfig.path,
          isTypeScript
        )

        if (!updated) {
          console.log(
            '   Could not automatically update the existing flat config.'
          )
          console.log(
            '   Please manually ensure your ESLint config extends "next/core-web-vitals"'
          )
          if (isTypeScript) {
            console.log('   and "next/typescript" for TypeScript projects.')
          }
        }
      }
    } else {
      // Legacy config exists
      if (existingConfig.path) {
        console.log(
          `   Found legacy ESLint config: ${path.basename(existingConfig.path)}`
        )
        console.log(
          '   Legacy .eslintrc configs are not automatically migrated.'
        )
        console.log(
          '   Please migrate to flat config format (eslint.config.js) and ensure it extends:'
        )
        console.log('   - "next/core-web-vitals"')
        if (isTypeScript) {
          console.log('   - "next/typescript"')
        }
        console.log(
          '   Learn more: https://eslint.org/docs/latest/use/configure/migration-guide'
        )
      }
    }
  } else {
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
  }

  // Update package.json
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
