/* global jest */
jest.autoMockOff()
const fs = require('fs')
const path = require('path')
const { tmpdir } = require('os')
const transformer = require('../next-lint-to-eslint-cli').default

describe('next-lint-to-eslint-cli', () => {
  let tempDir

  beforeEach(() => {
    // Create a unique temp directory for each test
    tempDir = fs.mkdtempSync(path.join(tmpdir(), 'codemod-test-'))
  })

  afterEach(() => {
    // Clean up temp directory
    if (tempDir && fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true })
    }
  })

  test('transforms correctly using basic data', () => {
    // Read input fixture
    const inputPath = path.join(__dirname, '../__testfixtures__/next-lint-to-eslint-cli/basic.input.json')
    const expectedOutputPath = path.join(__dirname, '../__testfixtures__/next-lint-to-eslint-cli/basic.output.json')
    
    const inputContent = fs.readFileSync(inputPath, 'utf8')
    const expectedOutput = fs.readFileSync(expectedOutputPath, 'utf8')

    // Set up test project
    const packageJsonPath = path.join(tempDir, 'package.json')
    const tsConfigPath = path.join(tempDir, 'tsconfig.json')
    
    fs.writeFileSync(packageJsonPath, inputContent)
    fs.writeFileSync(tsConfigPath, '{}') // Create tsconfig.json to indicate TypeScript project

    // Run transformer
    const consoleSpy = jest.spyOn(console, 'log').mockImplementation(() => {})
    const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {})
    
    transformer([tempDir], { skipInstall: true })

    // Check package.json was updated correctly
    const actualPackageJson = fs.readFileSync(packageJsonPath, 'utf8')
    expect(JSON.parse(actualPackageJson)).toEqual(JSON.parse(expectedOutput))

    // Check eslint.config.mjs was created
    const eslintConfigPath = path.join(tempDir, 'eslint.config.mjs')
    expect(fs.existsSync(eslintConfigPath)).toBe(true)
    
    const eslintConfig = fs.readFileSync(eslintConfigPath, 'utf8')
    expect(eslintConfig).toContain('next/core-web-vitals')
    expect(eslintConfig).toContain('next/typescript')
    expect(eslintConfig).toContain('ignores:')

    consoleSpy.mockRestore()
    consoleErrorSpy.mockRestore()
  })

  test('transforms correctly using existing-eslint data', () => {
    // Read input fixture
    const inputPath = path.join(__dirname, '../__testfixtures__/next-lint-to-eslint-cli/existing-eslint.input.json')
    const expectedOutputPath = path.join(__dirname, '../__testfixtures__/next-lint-to-eslint-cli/existing-eslint.output.json')
    
    const inputContent = fs.readFileSync(inputPath, 'utf8')
    const expectedOutput = fs.readFileSync(expectedOutputPath, 'utf8')

    // Set up test project
    const packageJsonPath = path.join(tempDir, 'package.json')
    const existingEslintPath = path.join(tempDir, '.eslintrc.json')
    
    fs.writeFileSync(packageJsonPath, inputContent)
    fs.writeFileSync(existingEslintPath, '{"extends": ["next"]}') // Create existing ESLint config

    // Run transformer
    const consoleSpy = jest.spyOn(console, 'log').mockImplementation(() => {})
    const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {})
    
    transformer([tempDir], { skipInstall: true })

    // Check package.json was updated correctly
    const actualPackageJson = fs.readFileSync(packageJsonPath, 'utf8')
    expect(JSON.parse(actualPackageJson)).toEqual(JSON.parse(expectedOutput))

    // Check that no new eslint.config.mjs was created (existing config should be preserved)
    const eslintConfigPath = path.join(tempDir, 'eslint.config.mjs')
    expect(fs.existsSync(eslintConfigPath)).toBe(false)

    // Check that existing config still exists
    expect(fs.existsSync(existingEslintPath)).toBe(true)

    consoleSpy.mockRestore()
    consoleErrorSpy.mockRestore()
  })

  test('handles complex script patterns correctly', () => {
    const inputPath = path.join(__dirname, '../__testfixtures__/next-lint-to-eslint-cli/complex-scripts.input.json')
    const expectedOutputPath = path.join(__dirname, '../__testfixtures__/next-lint-to-eslint-cli/complex-scripts.output.json')
    
    const inputContent = fs.readFileSync(inputPath, 'utf8')
    const expectedOutput = fs.readFileSync(expectedOutputPath, 'utf8')

    const packageJsonPath = path.join(tempDir, 'package.json')
    fs.writeFileSync(packageJsonPath, inputContent)

    const consoleSpy = jest.spyOn(console, 'log').mockImplementation(() => {})
    const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {})
    
    transformer([tempDir], { skipInstall: true })

    const actualPackageJson = fs.readFileSync(packageJsonPath, 'utf8')
    expect(JSON.parse(actualPackageJson)).toEqual(JSON.parse(expectedOutput))

    consoleSpy.mockRestore()
    consoleErrorSpy.mockRestore()
  })

  test('updates existing ES module flat config with AST manipulation', () => {
    const inputPath = path.join(__dirname, '../__testfixtures__/next-lint-to-eslint-cli/existing-flat-config.input.json')
    const expectedOutputPath = path.join(__dirname, '../__testfixtures__/next-lint-to-eslint-cli/existing-flat-config.output.json')
    const eslintConfigFixture = path.join(__dirname, '../__testfixtures__/next-lint-to-eslint-cli/existing-flat-config.eslint.js')
    
    const inputContent = fs.readFileSync(inputPath, 'utf8')
    const expectedOutput = fs.readFileSync(expectedOutputPath, 'utf8')
    const eslintConfigContent = fs.readFileSync(eslintConfigFixture, 'utf8')

    const packageJsonPath = path.join(tempDir, 'package.json')
    const eslintConfigPath = path.join(tempDir, 'eslint.config.js')
    
    fs.writeFileSync(packageJsonPath, inputContent)
    fs.writeFileSync(eslintConfigPath, eslintConfigContent)

    const consoleSpy = jest.spyOn(console, 'log').mockImplementation(() => {})
    const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {})
    
    transformer([tempDir], { skipInstall: true })

    // Check package.json was updated
    const actualPackageJson = fs.readFileSync(packageJsonPath, 'utf8')
    expect(JSON.parse(actualPackageJson)).toEqual(JSON.parse(expectedOutput))

    // Check that existing config was updated with Next.js configs
    const updatedConfig = fs.readFileSync(eslintConfigPath, 'utf8')
    expect(updatedConfig).toContain('FlatCompat')
    expect(updatedConfig).toContain('next/core-web-vitals')
    expect(updatedConfig).toContain('no-console') // Original rule should be preserved
    expect(updatedConfig).toContain('semi') // Original rule should be preserved
    expect(updatedConfig).toContain('ignores') // Should add ignores section
    expect(updatedConfig).toContain('.next/**') // Should include Next.js build directory

    consoleSpy.mockRestore()
    consoleErrorSpy.mockRestore()
  })

  test('updates existing CommonJS flat config with AST manipulation', () => {
    const inputPath = path.join(__dirname, '../__testfixtures__/next-lint-to-eslint-cli/existing-flat-config.input.json')
    const expectedOutputPath = path.join(__dirname, '../__testfixtures__/next-lint-to-eslint-cli/existing-flat-config.output.json')
    const eslintConfigFixture = path.join(__dirname, '../__testfixtures__/next-lint-to-eslint-cli/cjs-flat-config.eslint.cjs')
    
    const inputContent = fs.readFileSync(inputPath, 'utf8')
    const expectedOutput = fs.readFileSync(expectedOutputPath, 'utf8')
    const eslintConfigContent = fs.readFileSync(eslintConfigFixture, 'utf8')

    const packageJsonPath = path.join(tempDir, 'package.json')
    const eslintConfigPath = path.join(tempDir, 'eslint.config.cjs')
    
    fs.writeFileSync(packageJsonPath, inputContent)
    fs.writeFileSync(eslintConfigPath, eslintConfigContent)

    const consoleSpy = jest.spyOn(console, 'log').mockImplementation(() => {})
    const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {})
    
    transformer([tempDir], { skipInstall: true })

    // Check package.json was updated
    const actualPackageJson = fs.readFileSync(packageJsonPath, 'utf8')
    expect(JSON.parse(actualPackageJson)).toEqual(JSON.parse(expectedOutput))

    // Check that existing config was updated with Next.js configs
    const updatedConfig = fs.readFileSync(eslintConfigPath, 'utf8')
    expect(updatedConfig).toContain('FlatCompat')
    expect(updatedConfig).toContain('require')
    expect(updatedConfig).toContain('next/core-web-vitals')
    expect(updatedConfig).toContain('quotes') // Original rule should be preserved
    expect(updatedConfig).toContain('indent') // Original rule should be preserved
    expect(updatedConfig).toContain('ignores') // Should add ignores section
    expect(updatedConfig).toContain('node_modules/**') // Should include common ignores

    consoleSpy.mockRestore()
    consoleErrorSpy.mockRestore()
  })

  test('handles package.json without scripts section', () => {
    const inputPath = path.join(__dirname, '../__testfixtures__/next-lint-to-eslint-cli/no-scripts.input.json')
    const expectedOutputPath = path.join(__dirname, '../__testfixtures__/next-lint-to-eslint-cli/no-scripts.output.json')
    
    const inputContent = fs.readFileSync(inputPath, 'utf8')
    const expectedOutput = fs.readFileSync(expectedOutputPath, 'utf8')

    const packageJsonPath = path.join(tempDir, 'package.json')
    fs.writeFileSync(packageJsonPath, inputContent)

    const consoleSpy = jest.spyOn(console, 'log').mockImplementation(() => {})
    const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {})
    
    transformer([tempDir], { skipInstall: true })

    // Check package.json was updated with dependencies only
    const actualPackageJson = fs.readFileSync(packageJsonPath, 'utf8')
    expect(JSON.parse(actualPackageJson)).toEqual(JSON.parse(expectedOutput))

    // Check that eslint.config.mjs was created
    const eslintConfigPath = path.join(tempDir, 'eslint.config.mjs')
    expect(fs.existsSync(eslintConfigPath)).toBe(true)

    consoleSpy.mockRestore()
    consoleErrorSpy.mockRestore()
  })

  test('preserves existing eslint dependencies', () => {
    const packageJson = {
      name: 'app-with-eslint',
      scripts: {
        lint: 'next lint'
      },
      dependencies: {
        next: '15.0.0'
      },
      devDependencies: {
        eslint: '^8.57.0',
        'eslint-config-next': '14.2.0'
      }
    }

    const packageJsonPath = path.join(tempDir, 'package.json')
    fs.writeFileSync(packageJsonPath, JSON.stringify(packageJson, null, 2))

    const consoleSpy = jest.spyOn(console, 'log').mockImplementation(() => {})
    const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {})
    
    transformer([tempDir], { skipInstall: true })

    const actualPackageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'))
    
    // Should preserve existing eslint versions
    expect(actualPackageJson.devDependencies.eslint).toBe('^8.57.0')
    expect(actualPackageJson.devDependencies['eslint-config-next']).toBe('14.2.0')
    // Should add missing @eslint/eslintrc
    expect(actualPackageJson.devDependencies['@eslint/eslintrc']).toBe('^3')

    consoleSpy.mockRestore()
    consoleErrorSpy.mockRestore()
  })

  test('handles TypeScript config files', () => {
    const packageJson = {
      name: 'app-with-ts-config',
      scripts: {
        lint: 'next lint'
      },
      dependencies: {
        next: '15.0.0'
      }
    }

    const packageJsonPath = path.join(tempDir, 'package.json')
    const eslintConfigPath = path.join(tempDir, 'eslint.config.ts')
    
    fs.writeFileSync(packageJsonPath, JSON.stringify(packageJson, null, 2))
    fs.writeFileSync(eslintConfigPath, 'export default []')

    const consoleSpy = jest.spyOn(console, 'log').mockImplementation(() => {})
    const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {})
    const consoleWarnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {})
    
    transformer([tempDir], { skipInstall: true })

    // Should log that TypeScript configs require manual migration
    expect(consoleWarnSpy).toHaveBeenCalledWith(
      expect.anything(),
      expect.stringContaining('TypeScript config files require manual migration')
    )

    consoleSpy.mockRestore()
    consoleErrorSpy.mockRestore()
    consoleWarnSpy.mockRestore()
  })

  test('handles missing package.json gracefully', () => {
    const consoleSpy = jest.spyOn(console, 'log').mockImplementation(() => {})
    const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {})
    
    transformer([tempDir], { skipInstall: true })

    expect(consoleErrorSpy).toHaveBeenCalledWith('Error: package.json not found in the specified directory')

    consoleSpy.mockRestore()
    consoleErrorSpy.mockRestore()
  })

  test('handles missing directory argument', () => {
    const consoleSpy = jest.spyOn(console, 'log').mockImplementation(() => {})
    const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {})
    
    transformer([], { skipInstall: true })

    expect(consoleErrorSpy).toHaveBeenCalledWith('Error: Please specify a directory path')

    consoleSpy.mockRestore()
    consoleErrorSpy.mockRestore()
  })

  test('creates JavaScript config for non-TypeScript projects', () => {
    const packageJson = {
      name: 'js-app',
      scripts: {
        lint: 'next lint'
      },
      dependencies: {
        next: '15.0.0',
        react: '^18.0.0'
      }
    }

    const packageJsonPath = path.join(tempDir, 'package.json')
    fs.writeFileSync(packageJsonPath, JSON.stringify(packageJson, null, 2))

    const consoleSpy = jest.spyOn(console, 'log').mockImplementation(() => {})
    const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {})
    
    transformer([tempDir], { skipInstall: true })

    // Check that eslint.config.mjs was created without TypeScript config
    const eslintConfigPath = path.join(tempDir, 'eslint.config.mjs')
    const eslintConfig = fs.readFileSync(eslintConfigPath, 'utf8')
    
    expect(eslintConfig).toContain('next/core-web-vitals')
    expect(eslintConfig).not.toContain('next/typescript')

    consoleSpy.mockRestore()
    consoleErrorSpy.mockRestore()
  })

  test('adds ignores even when Next.js configs are already present', () => {
    const existingConfig = `
import { FlatCompat } from "@eslint/eslintrc"
const compat = new FlatCompat({ baseDirectory: __dirname })
export default [
  ...compat.extends("next/core-web-vitals"),
  { rules: { "no-console": "warn" } }
]`

    const packageJson = {
      name: 'app-with-next-config',
      scripts: {
        lint: 'next lint'
      },
      dependencies: {
        next: '15.0.0'
      }
    }

    const packageJsonPath = path.join(tempDir, 'package.json')
    const eslintConfigPath = path.join(tempDir, 'eslint.config.js')
    
    fs.writeFileSync(packageJsonPath, JSON.stringify(packageJson, null, 2))
    fs.writeFileSync(eslintConfigPath, existingConfig)

    const consoleSpy = jest.spyOn(console, 'log').mockImplementation(() => {})
    const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {})
    
    transformer([tempDir], { skipInstall: true })

    // Should still add ignores even though Next.js configs are present
    const updatedConfig = fs.readFileSync(eslintConfigPath, 'utf8')
    expect(updatedConfig).toContain('ignores')
    expect(updatedConfig).toContain('.next/**')
    expect(updatedConfig).toContain('node_modules/**')

    consoleSpy.mockRestore()
    consoleErrorSpy.mockRestore()
  })

  test('handles scripts with paths containing spaces', () => {
    const packageJson = {
      name: 'app-with-spaces',
      scripts: {
        lint: 'next lint --dir "src/my components" --file "test file.js"'
      },
      dependencies: {
        next: '15.0.0'
      }
    }

    const packageJsonPath = path.join(tempDir, 'package.json')
    fs.writeFileSync(packageJsonPath, JSON.stringify(packageJson, null, 2))

    const consoleSpy = jest.spyOn(console, 'log').mockImplementation(() => {})
    const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {})
    
    transformer([tempDir], { skipInstall: true })

    const actualPackageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'))
    expect(actualPackageJson.scripts.lint).toBe('eslint "src/my components" "test file.js"')

    consoleSpy.mockRestore()
    consoleErrorSpy.mockRestore()
  })

  test('does not duplicate ignores if already present', () => {
    const packageJson = {
      name: 'app-with-existing-ignores',
      scripts: {
        lint: 'next lint'
      },
      dependencies: {
        next: '15.0.0'
      }
    }

    const existingConfig = `export default [
  {
    ignores: ["dist/**", "coverage/**"]
  },
  {
    rules: {
      "no-unused-vars": "warn"
    }
  }
]`

    const packageJsonPath = path.join(tempDir, 'package.json')
    const eslintConfigPath = path.join(tempDir, 'eslint.config.js')
    
    fs.writeFileSync(packageJsonPath, JSON.stringify(packageJson, null, 2))
    fs.writeFileSync(eslintConfigPath, existingConfig)

    const consoleSpy = jest.spyOn(console, 'log').mockImplementation(() => {})
    const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {})
    
    transformer([tempDir], { skipInstall: true })

    const updatedConfig = fs.readFileSync(eslintConfigPath, 'utf8')
    
    // Should add Next.js extends
    expect(updatedConfig).toContain('next/core-web-vitals')
    
    // Should preserve existing ignores
    expect(updatedConfig).toContain('dist/**')
    expect(updatedConfig).toContain('coverage/**')
    
    // Check that Next.js ignores are added to existing ignores
    expect(updatedConfig).toContain('.next/**') // Next.js build dir added
    expect(updatedConfig).toContain('node_modules/**') // Common ignore added
    
    consoleSpy.mockRestore()
    consoleErrorSpy.mockRestore()
  })

  test('handles unsupported flags with warnings', () => {
    const packageJson = {
      name: 'app-with-unsupported-flags',
      scripts: {
        lint: 'next lint --rulesdir ./custom-rules --ext .js,.jsx'
      },
      dependencies: {
        next: '15.0.0'
      }
    }

    const packageJsonPath = path.join(tempDir, 'package.json')
    fs.writeFileSync(packageJsonPath, JSON.stringify(packageJson, null, 2))

    const consoleSpy = jest.spyOn(console, 'log').mockImplementation(() => {})
    const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {})
    
    transformer([tempDir], { skipInstall: true })

    // Should show warnings about unsupported flags
    expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('--rulesdir is not supported in ESLint v9'))
    expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('--ext is not needed in ESLint v9'))

    // Script should be updated without the unsupported flags
    const actualPackageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'))
    expect(actualPackageJson.scripts.lint).toBe('eslint .')

    consoleSpy.mockRestore()
    consoleErrorSpy.mockRestore()
  })
})