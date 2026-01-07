import { join } from 'path'
import { execSync } from 'child_process'
import { getEslintConfigSnapshot } from '../utils'

describe('eslint-config-next/core-web-vitals', () => {
  it('should match expected resolved configuration', () => {
    const eslintConfigAfterSetupJSON = execSync(
      // Pass explicit absolute path to not get affected by the root eslint config.
      `pnpm eslint --config ${join(__dirname, 'eslint.config.mjs')} --print-config ${join(__dirname, 'test.js')}`,
      {
        cwd: __dirname,
        encoding: 'utf8',
        stdio: ['pipe', 'pipe', 'inherit'],
      }
    )

    const { settings, languageOptions, ...eslintConfigAfterSetup } = JSON.parse(
      eslintConfigAfterSetupJSON
    )

    expect({
      parser: languageOptions.parser,
      settings,
    }).toEqual({
      parser: expect.stringContaining('eslint-config-next'),
      settings: {
        'import/parsers': expect.any(Object),
        'import/resolver': expect.any(Object),
        react: {
          version: 'detect',
        },
      },
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
         "react",
         "react-hooks:eslint-plugin-react-hooks@7.0.0",
         "import",
         "jsx-a11y:eslint-plugin-jsx-a11y@6.10.2",
         "@next/next:@next/eslint-plugin-next",
       ],
       "rules": {
         "@next/next/google-font-display": [
           1,
         ],
         "@next/next/google-font-preconnect": [
           1,
         ],
         "@next/next/inline-script-id": [
           2,
         ],
         "@next/next/next-script-for-ga": [
           1,
         ],
         "@next/next/no-assign-module-variable": [
           2,
         ],
         "@next/next/no-async-client-component": [
           1,
         ],
         "@next/next/no-before-interactive-script-outside-document": [
           1,
         ],
         "@next/next/no-css-tags": [
           1,
         ],
         "@next/next/no-document-import-in-page": [
           2,
         ],
         "@next/next/no-duplicate-head": [
           2,
         ],
         "@next/next/no-head-element": [
           1,
         ],
         "@next/next/no-head-import-in-document": [
           2,
         ],
         "@next/next/no-html-link-for-pages": [
           2,
         ],
         "@next/next/no-img-element": [
           1,
         ],
         "@next/next/no-page-custom-font": [
           1,
         ],
         "@next/next/no-script-component-in-head": [
           2,
         ],
         "@next/next/no-styled-jsx-in-document": [
           1,
         ],
         "@next/next/no-sync-scripts": [
           2,
         ],
         "@next/next/no-title-in-document-head": [
           1,
         ],
         "@next/next/no-typos": [
           1,
         ],
         "@next/next/no-unwanted-polyfillio": [
           1,
         ],
         "import/no-anonymous-default-export": [
           1,
         ],
         "jsx-a11y/alt-text": [
           1,
           {
             "elements": [
               "img",
             ],
             "img": [
               "Image",
             ],
           },
         ],
         "jsx-a11y/aria-props": [
           1,
         ],
         "jsx-a11y/aria-proptypes": [
           1,
         ],
         "jsx-a11y/aria-unsupported-elements": [
           1,
         ],
         "jsx-a11y/role-has-required-aria-props": [
           1,
         ],
         "jsx-a11y/role-supports-aria-props": [
           1,
         ],
         "react-hooks/component-hook-factories": [
           2,
         ],
         "react-hooks/config": [
           2,
         ],
         "react-hooks/error-boundaries": [
           2,
         ],
         "react-hooks/exhaustive-deps": [
           1,
         ],
         "react-hooks/gating": [
           2,
         ],
         "react-hooks/globals": [
           2,
         ],
         "react-hooks/immutability": [
           2,
         ],
         "react-hooks/incompatible-library": [
           1,
         ],
         "react-hooks/preserve-manual-memoization": [
           2,
         ],
         "react-hooks/purity": [
           2,
         ],
         "react-hooks/refs": [
           2,
         ],
         "react-hooks/rules-of-hooks": [
           2,
         ],
         "react-hooks/set-state-in-effect": [
           2,
         ],
         "react-hooks/set-state-in-render": [
           2,
         ],
         "react-hooks/static-components": [
           2,
         ],
         "react-hooks/unsupported-syntax": [
           1,
         ],
         "react-hooks/use-memo": [
           2,
         ],
         "react/display-name": [
           2,
         ],
         "react/jsx-key": [
           2,
         ],
         "react/jsx-no-comment-textnodes": [
           2,
         ],
         "react/jsx-no-duplicate-props": [
           2,
         ],
         "react/jsx-no-undef": [
           2,
         ],
         "react/jsx-uses-react": [
           2,
         ],
         "react/jsx-uses-vars": [
           2,
         ],
         "react/no-children-prop": [
           2,
         ],
         "react/no-danger-with-children": [
           2,
         ],
         "react/no-deprecated": [
           2,
         ],
         "react/no-direct-mutation-state": [
           2,
         ],
         "react/no-find-dom-node": [
           2,
         ],
         "react/no-is-mounted": [
           2,
         ],
         "react/no-render-return-value": [
           2,
         ],
         "react/no-string-refs": [
           2,
         ],
         "react/no-unescaped-entities": [
           2,
         ],
         "react/require-render-return": [
           2,
         ],
       },
     }
    `)
  })
})
