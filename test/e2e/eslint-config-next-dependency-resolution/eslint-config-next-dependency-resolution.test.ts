import { spawnSync } from 'child_process'
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  writeFileSync,
} from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'

// Regression test for the dependency graph that `eslint-config-next` pulls in.
//
// `eslint-plugin-react-hooks` requires `zod-validation-error/v4` at load time,
// but declares `zod-validation-error: ^3.5.0 || ^4.0.0`. `zod-validation-error`
// 3.5.4 satisfies that range and dropped the `./v4` subpath export, so an app
// that (directly or through its lockfile) also resolves `zod-validation-error`
// to 3.5.x makes ESLint crash before any file is linted.
//
// This test asserts the behavior as it exists today. Once the plugin range is
// tightened upstream, or `eslint-config-next` constrains `zod-validation-error`
// itself, ESLint stops crashing and the expectation below has to be updated.

const eslintConfigNextPackageJson = JSON.parse(
  readFileSync(
    join(__dirname, '../../../packages/eslint-config-next/package.json'),
    'utf8'
  )
) as {
  dependencies: Record<string, string>
  overrides?: Record<string, string>
}

const reactHooksRange =
  eslintConfigNextPackageJson.dependencies['eslint-plugin-react-hooks']

// If `eslint-config-next` ever constrains `zod-validation-error` itself, honor
// that constraint here so the test reflects what apps actually install.
const zodValidationErrorConstraint =
  eslintConfigNextPackageJson.dependencies['zod-validation-error'] ??
  eslintConfigNextPackageJson.overrides?.['zod-validation-error']

function createApp() {
  const appDir = mkdtempSync(join(tmpdir(), 'eslint-config-next-deps-'))

  writeFileSync(
    join(appDir, 'package.json'),
    JSON.stringify(
      {
        name: 'eslint-config-next-dependency-resolution',
        version: '0.0.0',
        private: true,
        dependencies: {
          eslint: '9.39.5',
          'eslint-plugin-react-hooks': reactHooksRange,
          // A plain app dependency on zod 3 is enough to collapse the plugin's
          // copy of `zod-validation-error` onto the 3.5.x line.
          zod: '^3.25.76',
          'zod-validation-error': '^3.5.0',
        },
        ...(zodValidationErrorConstraint
          ? {
              overrides: {
                'zod-validation-error': zodValidationErrorConstraint,
              },
            }
          : {}),
      },
      null,
      2
    )
  )

  writeFileSync(
    join(appDir, 'eslint.config.mjs'),
    `import reactHooks from 'eslint-plugin-react-hooks'\n\nexport default [reactHooks.configs.recommended]\n`
  )

  mkdirSync(join(appDir, 'app'))
  writeFileSync(
    join(appDir, 'app/page.jsx'),
    `export default function Page() {\n  return null\n}\n`
  )

  const install = spawnSync(
    'npm',
    ['install', '--no-audit', '--no-fund', '--ignore-scripts'],
    { cwd: appDir, encoding: 'utf8' }
  )
  if (install.status !== 0) {
    throw new Error(`npm install failed:\n${install.stdout}\n${install.stderr}`)
  }

  return appDir
}

describe('eslint-config-next dependency resolution', () => {
  it(
    'crashes ESLint because the resolved zod-validation-error has no ./v4 export',
    () => {
      const appDir = createApp()

      // The copy of `zod-validation-error` that the plugin actually loads:
      // either nested under the plugin or hoisted to the app root.
      const nestedPackageJson = join(
        appDir,
        'node_modules/eslint-plugin-react-hooks/node_modules/zod-validation-error/package.json'
      )
      const resolvedVersion = JSON.parse(
        readFileSync(
          existsSync(nestedPackageJson)
            ? nestedPackageJson
            : join(appDir, 'node_modules/zod-validation-error/package.json'),
          'utf8'
        )
      ).version as string

      const eslint = spawnSync(
        process.execPath,
        [
          join(appDir, 'node_modules/eslint/bin/eslint.js'),
          '--format',
          'json',
          '.',
        ],
        { cwd: appDir, encoding: 'utf8' }
      )

      const failure = eslint.stderr
        .split('\n')
        .find((line) => line.includes('ERR_PACKAGE_PATH_NOT_EXPORTED'))
        ?.replace(/in \S*package\.json/, 'in "zod-validation-error"')
        .trim()

      expect({
        major: resolvedVersion.split('.')[0],
        exitCode: eslint.status,
        failure,
      }).toEqual({
        major: '3',
        exitCode: 2,
        failure:
          'Error [ERR_PACKAGE_PATH_NOT_EXPORTED]: Package subpath \'./v4\' is not defined by "exports" in "zod-validation-error"',
      })
    },
    5 * 60 * 1000
  )
})
