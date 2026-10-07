const { RuleTester } = require('eslint');
const rule = require('../src/rules/no-html-link-for-pages'); // Path to your rule

const ruleTester = new RuleTester({
  parserOptions: {
    ecmaVersion: 2020,
    sourceType: 'module',
    ecmaFeatures: { jsx: true },
  },
});

ruleTester.run('no-html-link-for-pages', rule, {
  valid: [
    '<Link href="/about">Good Link</Link>',
    '<a href="https://external.com">External</a>',
    '<a href="/about" target="_blank">Blank Target</a>',
    '<a href="/file.pdf" download>Download</a>',
    '<a href="#hash">Hash</a>',
  ],
  invalid: [
    {
      code: '<a href="/about">Bad Link</a>',
      errors: [{ message: /Do not use an `<a>` element/ }],
    },
    // Custom pageExtensions test
    {
      code: '<a href="/about">Bad Link Custom Ext</a>',
      filename: 'pages/index.page.tsx', // Simulates custom extension context
      errors: [{ message: /Do not use an `<a>` element/ }],
    },
  ],
});