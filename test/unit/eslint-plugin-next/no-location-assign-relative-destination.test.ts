import { RuleTester } from 'eslint'
import { rules } from '@next/eslint-plugin-next'

const NextESLintRule = rules['no-location-assign-relative-destination']

const err = (expression: string) => ({
  messageId: 'noLocationAssign',
  data: { expression },
})

describe('no-location-assign-relative-destination', () => {
  new RuleTester({
    languageOptions: {
      ecmaVersion: 2018,
      sourceType: 'module',
      parserOptions: {
        ecmaFeatures: {
          modules: true,
          jsx: true,
        },
      },
      globals: {
        location: 'readonly',
        window: 'readonly',
        globalThis: 'readonly',
        document: 'readonly',
        self: 'readonly',
      },
    },
  }).run('eslint', NextESLintRule, {
    valid: [
      // Absolute URLs are allowed
      "location.href = 'https://example.com'",
      "location.href = 'https://example.com/path?q=1'",
      "window.location.href = 'https://example.com'",
      "globalThis.location.href = 'https://example.com'",
      "location.assign('https://example.com')",
      "window.location.assign('https://example.com')",
      "globalThis.location.assign('https://example.com')",

      // Protocol-relative URLs are absolute
      "location.href = '//example.com/path'",
      "location.assign('//cdn.example.com/file.js')",

      // Other protocols are absolute
      "location.href = 'ftp://files.example.com'",
      "location.href = 'mailto:user@example.com'",

      // Template literals starting with an absolute URL are fine
      // eslint-disable-next-line no-template-curly-in-string -- test code contains intentional template literal syntax
      'location.href = `https://example.com/${path}`',
      // eslint-disable-next-line no-template-curly-in-string -- test code contains intentional template literal syntax
      'location.assign(`https://example.com/${path}`)',

      // Non-string, non-template values cannot be statically determined — skip
      'location.href = someVariable',
      'location.assign(someVariable)',
      'window.location.href = computedUrl()',
      'window.location.assign(computedUrl())',

      // Dynamic values with static analyzable absolute prefix
      `
      const url = 'https://example.com';
      location.href = url;
      location.assign(url);
    `,

      `
      const url = 'https://example.com/' + someVariable;
      location.href = url;
      location.assign(url);
    `,
      `
      const url = \`https://example.com/\${someVariable}\`;
      location.href = url;
      location.assign(url);
    `,

      // Unrelated member expressions
      "foo.location.href = '/path'",
      "foo.location.assign('/path')",

      // Locally-shadowed `location` is not the browser global
      `
      const location = { href: '' };
      location.href = '/foo'
    `,
      `function handler(location) { location.href = '/foo'; location.assign('/foo') }`,
      // Locally-shadowed `window` / `globalThis`
      `
      const window = { location: { href: '' } };
      window.location.href = '/foo'
    `,
      `
      function handler(globalThis) {
        globalThis.location.assign('/foo')
      }
    `,
      // Imported `location` binding is not the browser global
      `
      import { location } from './my-module';
      location.href = '/foo'
    `,
    ],
    invalid: [
      // location.href = (relative)
      { code: `location.href = '/foo'`, errors: [err('location.href')] },
      { code: `location['href'] = '/foo'`, errors: [err("location['href']")] },
      // location.href = (relative, template literal)
      {
        code: `location.href = \`/users/\${id}\``,
        errors: [err('location.href')],
      },
      // window.location.href = (relative)
      {
        code: `window.location.href = '/foo'`,
        errors: [err('window.location.href')],
      },
      {
        code: `window.location.href = '/dashboard'`,
        errors: [err('window.location.href')],
      },
      {
        code: `window.location['href'] = '/foo'`,
        errors: [err("window.location['href']")],
      },
      {
        code: `window.location['href'] = '/dashboard'`,
        errors: [err("window.location['href']")],
      },
      // globalThis.location.href = (relative)
      {
        code: `globalThis.location.href = '/foo'`,
        errors: [err('globalThis.location.href')],
      },
      {
        code: `globalThis.location.href = '/dashboard'`,
        errors: [err('globalThis.location.href')],
      },
      // location.assign() (relative)
      { code: `location.assign('/foo')`, errors: [err('location.assign()')] },
      {
        code: `location.assign('/dashboard')`,
        errors: [err('location.assign()')],
      },
      {
        code: `location['assign']('/foo')`,
        errors: [err("location['assign']()")],
      },
      {
        code: `location['assign']('/dashboard')`,
        errors: [err("location['assign']()")],
      },
      // location.assign() (relative, template literal)
      {
        code: `location.assign(\`/users/\${id}/profile\`)`,
        errors: [err('location.assign()')],
      },
      // window.location.assign() (relative)
      {
        code: `window.location.assign('/foo')`,
        errors: [err('window.location.assign()')],
      },
      {
        code: `window.location.assign('/dashboard')`,
        errors: [err('window.location.assign()')],
      },
      {
        code: `window.location['assign']('/foo')`,
        errors: [err("window.location['assign']()")],
      },

      // globalThis.location.assign() (relative)
      {
        code: `globalThis.location.assign('/foo')`,
        errors: [err('globalThis.location.assign()')],
      },
      {
        code: `globalThis.location.assign('/dashboard')`,
        errors: [err('globalThis.location.assign()')],
      },

      // Relative paths without leading slash
      { code: `location.href = './page'`, errors: [err('location.href')] },
      { code: `location.href = '../page'`, errors: [err('location.href')] },
      {
        code: `location.assign('?tab=settings')`,
        errors: [err('location.assign()')],
      },
      {
        code: `location.assign('#section')`,
        errors: [err('location.assign()')],
      },

      // Relative URLs stored in variables
      {
        code: `
          const url = '/dashboard';
          location.href = url;
        `,
        errors: [err('location.href')],
      },
      {
        code: `
          const url = '/dashboard/' + someVariable;
          location.href = url;
        `,
        errors: [err('location.href')],
      },
      {
        code: `
          const url = \`/dashboard/\${someVariable}\`;
          location.href = url;
        `,
        errors: [err('location.href')],
      },
      // let re-assignment with relative URL
      {
        code: `
          let url = 'https://example.com';
          url = '/other-path';
          location.href = url;
        `,
        errors: [err('location.href')],
      },

      // Inside a function
      {
        code: `
          function handleClick() {
            window.location.href = '/dashboard'
          }
        `,
        errors: [err('window.location.href')],
      },
      {
        code: `
          function handleClick() {
            location.assign('/dashboard')
          }
        `,
        errors: [err('location.assign()')],
      },
    ],
  })
})
