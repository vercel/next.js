import { join } from 'path'
import { execSync } from 'child_process'
import { getEslintConfigSnapshot } from '../utils'

describe('eslint-config-next/typescript', () => {
  it('should match expected resolved configuration', () => {
    const eslintConfigAfterSetupJSON = execSync(
      // Pass explicit absolute path to not get affected by the root eslint config.
      `pnpm eslint --config ${join(__dirname, 'eslint.config.mjs')} --print-config ${join(__dirname, 'test.tsx')}`,
      {
        cwd: __dirname,
        encoding: 'utf8',
        stdio: ['pipe', 'pipe', 'inherit'],
      }
    )

    const { languageOptions, ...eslintConfigAfterSetup } = JSON.parse(
      eslintConfigAfterSetupJSON
    )

    expect({
      parser: languageOptions.parser,
    }).toEqual({
      parser: expect.stringContaining('typescript-eslint'),
    })

    expect(getEslintConfigSnapshot(eslintConfigAfterSetup))
      .toMatchInlineSnapshot(`
     {
       "language": "@/js",
       "linterOptions": {
         "reportUnusedDisableDirectives": 1,
       },
       "plugins": [
         "@",
         "@typescript-eslint:@typescript-eslint/eslint-plugin@8.46.0",
       ],
       "rules": {
         "@typescript-eslint/ban-ts-comment": [
           2,
         ],
         "@typescript-eslint/no-array-constructor": [
           2,
         ],
         "@typescript-eslint/no-duplicate-enum-values": [
           2,
         ],
         "@typescript-eslint/no-empty-object-type": [
           2,
         ],
         "@typescript-eslint/no-explicit-any": [
           2,
         ],
         "@typescript-eslint/no-extra-non-null-assertion": [
           2,
         ],
         "@typescript-eslint/no-misused-new": [
           2,
         ],
         "@typescript-eslint/no-namespace": [
           2,
         ],
         "@typescript-eslint/no-non-null-asserted-optional-chain": [
           2,
         ],
         "@typescript-eslint/no-require-imports": [
           2,
         ],
         "@typescript-eslint/no-this-alias": [
           2,
         ],
         "@typescript-eslint/no-unnecessary-type-constraint": [
           2,
         ],
         "@typescript-eslint/no-unsafe-declaration-merging": [
           2,
         ],
         "@typescript-eslint/no-unsafe-function-type": [
           2,
         ],
         "@typescript-eslint/no-unused-expressions": [
           1,
           {
             "allowShortCircuit": false,
             "allowTaggedTemplates": false,
             "allowTernary": false,
           },
         ],
         "@typescript-eslint/no-unused-vars": [
           1,
         ],
         "@typescript-eslint/no-wrapper-object-types": [
           2,
         ],
         "@typescript-eslint/prefer-as-const": [
           2,
         ],
         "@typescript-eslint/prefer-namespace-keyword": [
           2,
         ],
         "@typescript-eslint/triple-slash-reference": [
           2,
         ],
         "no-var": [
           2,
         ],
         "prefer-const": [
           2,
           {
             "destructuring": "any",
             "ignoreReadBeforeAssign": false,
           },
         ],
         "prefer-rest-params": [
           2,
         ],
         "prefer-spread": [
           2,
         ],
       },
     }
    `)
  })
})
