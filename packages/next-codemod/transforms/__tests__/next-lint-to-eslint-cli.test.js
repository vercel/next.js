const fs = require('fs')
const path = require('path')
const os = require('os')

describe('next-lint-to-eslint-cli', () => {
  let isolatedDir
  let transformer
  let fixturesDir

  beforeAll(() => {
    // Create isolated directory ONCE
    const tmpBase = process.env.NEXT_TEST_DIR || os.tmpdir()
    isolatedDir = path.join(
      tmpBase,
      `next-lint-to-eslint-cli-test-${Date.now()}-${(Math.random() * 1000) | 0}`
    )
    fs.mkdirSync(isolatedDir, { recursive: true })

    // Copy all fixtures ONCE
    fixturesDir = path.join(isolatedDir, 'fixtures')
    const fixturesSrc = path.join(
      __dirname,
      '../__testfixtures__/next-lint-to-eslint-cli'
    )
    fs.cpSync(fixturesSrc, fixturesDir, { recursive: true })

    // Load transformer from original location (has all dependencies)
    transformer = require('../next-lint-to-eslint-cli.js').default
  })

  afterAll(() => {
    // Clean up ONCE after all tests
    if (isolatedDir && fs.existsSync(isolatedDir)) {
      fs.rmSync(isolatedDir, { recursive: true, force: true })
    }
  })

  describe('flat-config', () => {
    it('should keep config unchanged and transform package.json', () => {
      const testDir = path.join(fixturesDir, 'flat-config')
      // Check BEFORE state
      const beforeConfig = fs.readFileSync(
        path.join(testDir, 'eslint.config.mjs'),
        'utf8'
      )
      const beforePackage = fs.readFileSync(
        path.join(testDir, 'package.json'),
        'utf8'
      )

      expect(beforeConfig).toMatchInlineSnapshot(`
       "import { defineConfig } from 'eslint/config'
       import foo from 'foo'
       import bar from 'bar'

       const eslintConfig = defineConfig([
         foo,
         bar,
         {
           ignores: [
             'node_modules/**',
             '.next/**',
             'out/**',
             'build/**',
             'next-env.d.ts',
           ],
         },
       ])

       export default eslintConfig
       "
      `)

      expect(beforePackage).toMatchInlineSnapshot(`
        "{
          "scripts": {
            "lint": "next lint --fix --dir src --dir pages",
            "lint:strict": "next lint --strict",
            "lint:ci": "next lint --quiet --output-file lint-results.json",
            "precommit": "next lint --fix && npm test",
            "test": "jest && next lint",
            "complex": "npm run build && next lint --dir . --ext .js,.jsx,.ts,.tsx 2>/dev/null",
            "pipe": "next lint | tee lint.log",
            "redirect": "next lint > output.txt 2>&1",
            "multi": "next lint; next build; next lint --fix"
          },
          "dependencies": {
            "react": "^19",
            "react-dom": "^19",
            "next": "^16"
          },
          "devDependencies": {
            "typescript": "^5",
            "@types/node": "^20",
            "@types/react": "^19",
            "@types/react-dom": "^19",
            "eslint": "^9",
            "eslint-config-next": "^16"
          }
        }
        "
      `)

      // Run transformer
      transformer([testDir], { skipInstall: true })

      // Check AFTER state
      const actualConfig = fs.readFileSync(
        path.join(testDir, 'eslint.config.mjs'),
        'utf8'
      )
      expect(actualConfig).toMatchInlineSnapshot(`
       "import nextCoreWebVitals from "eslint-config-next/core-web-vitals";
       import nextTypescript from "eslint-config-next/typescript";
       import { defineConfig } from 'eslint/config'
       import foo from 'foo'
       import bar from 'bar'

       const eslintConfig = defineConfig([...nextCoreWebVitals, ...nextTypescript, foo, bar, {
         ignores: [
           'node_modules/**',
           '.next/**',
           'out/**',
           'build/**',
           'next-env.d.ts',
         ],
       }])

       export default eslintConfig
       "
      `)

      // Check package.json transformed
      const actualPackage = fs.readFileSync(
        path.join(testDir, 'package.json'),
        'utf8'
      )
      expect(actualPackage).toMatchInlineSnapshot(`
       "{
         "scripts": {
           "lint": "eslint --fix src pages",
           "lint:strict": "eslint --max-warnings 0 .",
           "lint:ci": "eslint --quiet --output-file lint-results.json .",
           "precommit": "eslint --fix . && npm test",
           "test": "jest && eslint .",
           "complex": "npm run build && eslint . 2>/dev/null",
           "pipe": "eslint . | tee lint.log",
           "redirect": "eslint . > output.txt 2>&1",
           "multi": "eslint .; next build; eslint --fix ."
         },
         "dependencies": {
           "react": "^19",
           "react-dom": "^19",
           "next": "^16"
         },
         "devDependencies": {
           "typescript": "^5",
           "@types/node": "^20",
           "@types/react": "^19",
           "@types/react-dom": "^19",
           "eslint": "^9",
           "eslint-config-next": "^16"
         }
       }
       "
      `)
    })
  })

  describe('flat-config-flat-compat', () => {
    it('should replace FlatCompat with direct imports and transform package.json', () => {
      const testDir = path.join(fixturesDir, 'flat-config-flat-compat')
      // Check BEFORE state
      const beforeConfig = fs.readFileSync(
        path.join(testDir, 'eslint.config.mjs'),
        'utf8'
      )
      const beforePackage = fs.readFileSync(
        path.join(testDir, 'package.json'),
        'utf8'
      )

      expect(beforeConfig).toMatchInlineSnapshot(`
       "import { dirname } from 'path'
       import { fileURLToPath } from 'url'
       import { FlatCompat } from '@eslint/eslintrc'

       const __filename = fileURLToPath(import.meta.url)
       const __dirname = dirname(__filename)

       const compat = new FlatCompat({
         baseDirectory: __dirname,
       })

       const eslintConfig = [
         ...compat.extends('next/core-web-vitals', 'next/typescript'),
         {
           ignores: [
             'node_modules/**',
             '.next/**',
             'out/**',
             'build/**',
             'next-env.d.ts',
           ],
         },
       ]

       export default eslintConfig
       "
      `)

      expect(beforePackage).toMatchInlineSnapshot(`
        "{
          "scripts": {
            "lint": "next lint --fix --dir src --dir pages",
            "lint:strict": "next lint --strict",
            "lint:ci": "next lint --quiet --output-file lint-results.json",
            "precommit": "next lint --fix && npm test",
            "test": "jest && next lint",
            "complex": "npm run build && next lint --dir . --ext .js,.jsx,.ts,.tsx 2>/dev/null",
            "pipe": "next lint | tee lint.log",
            "redirect": "next lint > output.txt 2>&1",
            "multi": "next lint; next build; next lint --fix"
          },
          "dependencies": {
            "react": "^19",
            "react-dom": "^19",
            "next": "^16"
          },
          "devDependencies": {
            "typescript": "^5",
            "@types/node": "^20",
            "@types/react": "^19",
            "@types/react-dom": "^19",
            "eslint": "^9",
            "eslint-config-next": "^16"
          }
        }
        "
      `)

      // Run transformer
      transformer([testDir], { skipInstall: true })

      // Check AFTER state
      const actualConfig = fs.readFileSync(
        path.join(testDir, 'eslint.config.mjs'),
        'utf8'
      )
      expect(actualConfig).toMatchInlineSnapshot(`
       "import nextCoreWebVitals from "eslint-config-next/core-web-vitals";
       import nextTypescript from "eslint-config-next/typescript";
       import { dirname } from 'path'
       import { fileURLToPath } from 'url'

       const __filename = fileURLToPath(import.meta.url)
       const __dirname = dirname(__filename)

       const eslintConfig = [...nextCoreWebVitals, ...nextTypescript, {
         ignores: [
           'node_modules/**',
           '.next/**',
           'out/**',
           'build/**',
           'next-env.d.ts',
         ],
       }]

       export default eslintConfig
       "
      `)

      // Check package.json transformed
      const actualPackage = fs.readFileSync(
        path.join(testDir, 'package.json'),
        'utf8'
      )
      expect(actualPackage).toMatchInlineSnapshot(`
       "{
         "scripts": {
           "lint": "eslint --fix src pages",
           "lint:strict": "eslint --max-warnings 0 .",
           "lint:ci": "eslint --quiet --output-file lint-results.json .",
           "precommit": "eslint --fix . && npm test",
           "test": "jest && eslint .",
           "complex": "npm run build && eslint . 2>/dev/null",
           "pipe": "eslint . | tee lint.log",
           "redirect": "eslint . > output.txt 2>&1",
           "multi": "eslint .; next build; eslint --fix ."
         },
         "dependencies": {
           "react": "^19",
           "react-dom": "^19",
           "next": "^16"
         },
         "devDependencies": {
           "typescript": "^5",
           "@types/node": "^20",
           "@types/react": "^19",
           "@types/react-dom": "^19",
           "eslint": "^9",
           "eslint-config-next": "^16"
         }
       }
       "
      `)
    })
  })

  describe('flat-config-flat-compat-with-other-compat', () => {
    it('should replace FlatCompat config with direct imports while preserving other configs', () => {
      const testDir = path.join(fixturesDir, 'flat-config-flat-compat-with-other-compat')
      // Check BEFORE state
      const beforeConfig = fs.readFileSync(
        path.join(testDir, 'eslint.config.mjs'),
        'utf8'
      )

      expect(beforeConfig).toMatchInlineSnapshot(`
       "import { dirname } from 'path'
       import { fileURLToPath } from 'url'
       import { FlatCompat } from '@eslint/eslintrc'

       const __filename = fileURLToPath(import.meta.url)
       const __dirname = dirname(__filename)

       const compat = new FlatCompat({
         baseDirectory: __dirname,
       })

       const eslintConfig = [
         ...compat.config({
           extends: ['next/core-web-vitals', 'next/typescript'],
         }),
         ...compat.config({
           extends: ['foo', 'bar'],
         }),
         {
           ignores: [
             'node_modules/**',
             '.next/**',
             'out/**',
             'build/**',
             'next-env.d.ts',
           ],
         },
       ]

       export default eslintConfig
       "
      `)

      // Run transformer
      transformer([testDir], { skipInstall: true })

      // Check AFTER state
      const actualConfig = fs.readFileSync(
        path.join(testDir, 'eslint.config.mjs'),
        'utf8'
      )
      expect(actualConfig).toMatchInlineSnapshot(`
       "import nextCoreWebVitals from "eslint-config-next/core-web-vitals";
       import nextTypescript from "eslint-config-next/typescript";
       import { dirname } from 'path'
       import { fileURLToPath } from 'url'
       import { FlatCompat } from '@eslint/eslintrc'

       const __filename = fileURLToPath(import.meta.url)
       const __dirname = dirname(__filename)

       const compat = new FlatCompat({
         baseDirectory: __dirname,
       })

       const eslintConfig = [...nextCoreWebVitals, ...nextTypescript, ...compat.config({
         extends: ['foo', 'bar']
       }), {
         ignores: [
           'node_modules/**',
           '.next/**',
           'out/**',
           'build/**',
           'next-env.d.ts',
         ],
       }]

       export default eslintConfig
       "
      `)
    })
  })

  describe('legacy-config', () => {
    it('should migrate legacy config to flat config and transform package.json', async () => {
      const testDir = path.join(fixturesDir, 'legacy-config')
      // Check BEFORE state
      const beforeEslintrc = fs.readFileSync(
        path.join(testDir, '.eslintrc.json'),
        'utf8'
      )
      const beforeEslintignore = fs.readFileSync(
        path.join(testDir, '.eslintignore'),
        'utf8'
      )
      const beforePackage = fs.readFileSync(
        path.join(testDir, 'package.json'),
        'utf8'
      )

      expect(beforeEslintrc).toMatchInlineSnapshot(`
       "{
         "$schema": "https://json.schemastore.org/eslintrc",
         "root": true,
         "extends": [
           "next/core-web-vitals",
           "turbo",
           "prettier",
           "plugin:tailwindcss/recommended"
         ],
         "plugins": ["tailwindcss"],
         "ignorePatterns": ["**/fixtures/**"],
         "rules": {
           "@next/next/no-html-link-for-pages": "off",
           "tailwindcss/no-custom-classname": "off",
           "tailwindcss/classnames-order": "error"
         },
         "settings": {
           "tailwindcss": {
             "callees": ["cn", "cva"],
             "config": "tailwind.config.cjs"
           },
           "next": {
             "rootDir": ["apps/*/"]
           }
         },
         "overrides": [
           {
             "files": ["*.ts", "*.tsx"],
             "parser": "@typescript-eslint/parser"
           }
         ]
       }"
      `)

      expect(beforeEslintignore).toMatchInlineSnapshot(`
        "node_modules/**
        .next/**
        out/**
        build/**
        next-env.d.ts
        **/*.md"
      `)

      expect(beforePackage).toMatchInlineSnapshot(`
        "{
          "scripts": {
            "lint": "next lint --fix --dir src --dir pages",
            "lint:strict": "next lint --strict",
            "lint:ci": "next lint --quiet --output-file lint-results.json",
            "precommit": "next lint --fix && npm test",
            "test": "jest && next lint",
            "complex": "npm run build && next lint --dir . --ext .js,.jsx,.ts,.tsx 2>/dev/null",
            "pipe": "next lint | tee lint.log",
            "redirect": "next lint > output.txt 2>&1",
            "multi": "next lint; next build; next lint --fix"
          },
          "dependencies": {
            "react": "^19",
            "react-dom": "^19",
            "next": "^16"
          },
          "devDependencies": {
            "typescript": "^5",
            "@types/node": "^20",
            "@types/react": "^19",
            "@types/react-dom": "^19",
            "eslint": "^9",
            "eslint-config-next": "^16"
          }
        }
        "
      `)

      // Run transformer (now async)
      await transformer([testDir], { skipInstall: true })

      // Check AFTER state - eslint.config.mjs was created and transformed
      const actualConfig = fs.readFileSync(
        path.join(testDir, 'eslint.config.mjs'),
        'utf8'
      )
      expect(actualConfig).toMatchInlineSnapshot(`
       "import { defineConfig, globalIgnores } from "eslint/config";
       import nextCoreWebVitals from "eslint-config-next/core-web-vitals";
       import tailwindcss from "eslint-plugin-tailwindcss";
       import tsParser from "@typescript-eslint/parser";
       import path from "node:path";
       import { fileURLToPath } from "node:url";
       import js from "@eslint/js";
       import { FlatCompat } from "@eslint/eslintrc";

       const __filename = fileURLToPath(import.meta.url);
       const __dirname = path.dirname(__filename);
       const compat = new FlatCompat({
           baseDirectory: __dirname,
           recommendedConfig: js.configs.recommended,
           allConfig: js.configs.all
       });

       export default defineConfig([globalIgnores([
           "**/fixtures/**/*",
           "node_modules/**/*",
           ".next/**/*",
           "out/**/*",
           "build/**/*",
           "**/next-env.d.ts",
           "**/*.md",
       ]), {
           extends: [
               ...nextCoreWebVitals,
               ...compat.extends("turbo"),
               ...compat.extends("prettier"),
               ...compat.extends("plugin:tailwindcss/recommended")
           ],

           plugins: {
               tailwindcss,
           },

           settings: {
               tailwindcss: {
                   callees: ["cn", "cva"],
                   config: "tailwind.config.cjs",
               },

               next: {
                   rootDir: ["apps/*/"],
               },
           },

           rules: {
               "@next/next/no-html-link-for-pages": "off",
               "tailwindcss/no-custom-classname": "off",
               "tailwindcss/classnames-order": "error",
           },
       }, {
           files: ["**/*.ts", "**/*.tsx"],

           languageOptions: {
               parser: tsParser,
           },
       }]);"
      `)

      // Check package.json transformed
      const actualPackage = fs.readFileSync(
        path.join(testDir, 'package.json'),
        'utf8'
      )
      expect(actualPackage).toMatchInlineSnapshot(`
        "{
          "scripts": {
            "lint": "eslint --fix src pages",
            "lint:strict": "eslint --max-warnings 0 .",
            "lint:ci": "eslint --quiet --output-file lint-results.json .",
            "precommit": "eslint --fix . && npm test",
            "test": "jest && eslint .",
            "complex": "npm run build && eslint . 2>/dev/null",
            "pipe": "eslint . | tee lint.log",
            "redirect": "eslint . > output.txt 2>&1",
            "multi": "eslint .; next build; eslint --fix ."
          },
          "dependencies": {
            "react": "^19",
            "react-dom": "^19",
            "next": "^16"
          },
          "devDependencies": {
            "typescript": "^5",
            "@types/node": "^20",
            "@types/react": "^19",
            "@types/react-dom": "^19",
            "eslint": "^9",
            "eslint-config-next": "^16"
          }
        }
        "
      `)
    })
  })
})
