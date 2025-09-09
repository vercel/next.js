const { RuleTester } = require('eslint')
const rule = require('./eslint-typechecked-require')

// ESLint v9 flat config format
const ruleTester = new RuleTester({
  languageOptions: {
    parser: require('@typescript-eslint/parser'),
    parserOptions: {
      ecmaVersion: 2020,
      sourceType: 'module',
    },
  },
})

describe('require-cast-to-import ESLint rule', () => {
  ruleTester.run('require-cast-to-import', rule, {
    valid: [
      // ✅ Correct usage - basic modules
      {
        code: `const fs = require('fs') as typeof import('fs')`,
        filename: 'test.ts',
      },
      {
        code: `const path = require('path') as typeof import('path')`,
        filename: 'test.ts',
      },
      {
        code: `const express = require('express') as typeof import('express')`,
        filename: 'test.ts',
      },

      // ✅ Correct usage - scoped packages
      {
        code: `const lodash = require('@types/lodash') as typeof import('@types/lodash')`,
        filename: 'test.ts',
      },
      {
        code: `const react = require('@types/react') as typeof import('@types/react')`,
        filename: 'test.ts',
      },

      // ✅ Correct usage - relative imports
      {
        code: `const utils = require('./utils') as typeof import('./utils')`,
        filename: 'test.ts',
      },
      {
        code: `const config = require('../config/database') as typeof import('../config/database')`,
        filename: 'test.ts',
      },

      // ✅ Correct usage - complex paths
      {
        code: `const helper = require('../../shared/helpers/string-utils') as typeof import('../../shared/helpers/string-utils')`,
        filename: 'test.ts',
      },

      // ✅ Multiple requires in one statement
      {
        code: `const fs = require('fs') as typeof import('fs'), path = require('path') as typeof import('path')`,
        filename: 'test.ts',
      },

      // ✅ Require in different contexts
      {
        code: `
          function loadModule() {
            return require('dynamic-module') as typeof import('dynamic-module')
          }
        `,
        filename: 'test.ts',
      },

      // ✅ Correct usage - destructuring with cast
      {
        code: `const { readFile } = require('fs') as typeof import('fs')`,
        filename: 'test.ts',
      },

      // ✅ Non-require calls should be ignored
      {
        code: `const result = someFunction('fs')`,
        filename: 'test.ts',
      },
      {
        code: `import fs from 'fs'`,
        filename: 'test.ts',
      },

      // ✅ Template literals (dynamic requires)
      {
        code: `const module = require(\`\${moduleName}\`)`,
        filename: 'test.ts',
      },

      // ✅ Variable requires
      {
        code: `const module = require(moduleName)`,
        filename: 'test.ts',
      },

      // ✅ Expression requires
      {
        code: `const module = require('prefix' + suffix)`,
        filename: 'test.ts',
      },

      // ✅ Method called require
      {
        code: `obj.require('something')`,
        filename: 'test.ts',
      },

      // ✅ Multiple arguments
      {
        code: `const module = require('fs', 'extra')`,
        filename: 'test.ts',
      },

      // ✅ No arguments
      {
        code: `const module = require()`,
        filename: 'test.ts',
      },

      {
        code: `const config = require('./config.json')`,
        filename: 'test.ts',
      },
    ],

    invalid: [
      // ❌ Missing cast entirely
      {
        code: `const fs = require('fs')`,
        filename: 'test.ts',
        errors: [
          {
            messageId: 'missingCast',
            data: { source: 'fs' },
          },
        ],
        output: `const fs = (require('fs') as typeof import('fs'))`,
      },
      // ❌ Ensure member access is propagated correctly
      {
        code: `const readFile = require('fs').readFile`,
        filename: 'test.ts',
        errors: [
          {
            messageId: 'missingCast',
            data: { source: 'fs' },
          },
        ],
        output: `const readFile = (require('fs') as typeof import('fs')).readFile`,
      },
      {
        code: `const path = require('path')`,
        filename: 'test.ts',
        errors: [
          {
            messageId: 'missingCast',
            data: { source: 'path' },
          },
        ],
        output: `const path = (require('path') as typeof import('path'))`,
      },

      // ❌ Destructuring without cast
      {
        code: `const { readFile } = require('fs')`,
        filename: 'test.ts',
        errors: [
          {
            messageId: 'missingCast',
            data: { source: 'fs' },
          },
        ],
        output: `const { readFile } = (require('fs') as typeof import('fs'))`,
      },

      // ❌ Wrong cast type - using 'any'
      {
        code: `const lodash = require('lodash') as any`,
        filename: 'test.ts',
        errors: [
          {
            messageId: 'missingCast',
            data: { source: 'lodash' },
          },
        ],
        output: `const lodash = (require('lodash') as typeof import('lodash'))`,
      },

      // ❌ Wrong cast type - using specific interface
      {
        code: `const express = require('express') as Express`,
        filename: 'test.ts',
        errors: [
          {
            messageId: 'missingCast',
            data: { source: 'express' },
          },
        ],
        output: `const express = (require('express') as typeof import('express'))`,
      },

      // ❌ Mismatched sources
      {
        code: `const fs = require('fs') as typeof import('path')`,
        filename: 'test.ts',
        errors: [
          {
            messageId: 'mismatchedSource',
            data: { requireSource: 'fs', importSource: 'path' },
          },
        ],
        output: `const fs = (require('path') as typeof import('path'))`,
      },
      {
        code: `const lodash = require('lodash') as typeof import('underscore')`,
        filename: 'test.ts',
        errors: [
          {
            messageId: 'mismatchedSource',
            data: { requireSource: 'lodash', importSource: 'underscore' },
          },
        ],
        output: `const lodash = (require('underscore') as typeof import('underscore'))`,
      },
      // ❌ Mismatched sources - template literal
      {
        code: `const lodash = require(\`lodash\`) as typeof import('underscore')`,
        filename: 'test.ts',
        errors: [
          {
            messageId: 'mismatchedSource',
            data: { requireSource: 'lodash', importSource: 'underscore' },
          },
        ],
        output: `const lodash = (require('underscore') as typeof import('underscore'))`,
      },
      // ❌ Scoped packages - missing cast
      {
        code: `const types = require('@types/node')`,
        filename: 'test.ts',
        errors: [
          {
            messageId: 'missingCast',
            data: { source: '@types/node' },
          },
        ],
        output: `const types = (require('@types/node') as typeof import('@types/node'))`,
      },
      {
        code: `const pkg = require('@babel/core')`,
        filename: 'test.ts',
        errors: [{ messageId: 'missingCast' }],
        output: `const pkg = (require('@babel/core') as typeof import('@babel/core'))`,
      },

      // ❌ Packages with special characters
      {
        code: `const vue = require('vue3')`,
        filename: 'test.ts',
        errors: [{ messageId: 'missingCast' }],
        output: `const vue = (require('vue3') as typeof import('vue3'))`,
      },
      {
        code: `const parser = require('html-parser')`,
        filename: 'test.ts',
        errors: [{ messageId: 'missingCast' }],
        output: `const parser = (require('html-parser') as typeof import('html-parser'))`,
      },

      // ❌ Relative imports - missing cast
      {
        code: `const utils = require('./utils')`,
        filename: 'test.ts',
        errors: [
          {
            messageId: 'missingCast',
            data: { source: './utils' },
          },
        ],
        output: `const utils = (require('./utils') as typeof import('./utils'))`,
      },
      {
        code: `const config = require('../config')`,
        filename: 'test.ts',
        errors: [
          {
            messageId: 'missingCast',
            data: { source: '../config' },
          },
        ],
        output: `const config = (require('../config') as typeof import('../config'))`,
      },

      // ❌ Complex relative paths
      {
        code: `const util = require('../../../../utils/deep/nested')`,
        filename: 'test.ts',
        errors: [{ messageId: 'missingCast' }],
        output: `const util = (require('../../../../utils/deep/nested') as typeof import('../../../../utils/deep/nested'))`,
      },

      // ❌ Multiple violations in one file
      {
        code: `
          const fs = require('fs')
          const path = require('path') as any
          const lodash = require('lodash') as typeof import('underscore')
        `,
        filename: 'test.ts',
        errors: [
          {
            messageId: 'missingCast',
            data: { source: 'fs' },
          },
          {
            messageId: 'missingCast',
            data: { source: 'path' },
          },
          {
            messageId: 'mismatchedSource',
            data: { requireSource: 'lodash', importSource: 'underscore' },
          },
        ],
        output: `
          const fs = (require('fs') as typeof import('fs'))
          const path = (require('path') as typeof import('path'))
          const lodash = (require('underscore') as typeof import('underscore'))
        `,
      },

      // ❌ Require in function context
      {
        code: `
          function loadDynamicModule() {
            const module = require('dynamic-lib')
            return module
          }
        `,
        filename: 'test.ts',
        errors: [
          {
            messageId: 'missingCast',
            data: { source: 'dynamic-lib' },
          },
        ],
        output: `
          function loadDynamicModule() {
            const module = (require('dynamic-lib') as typeof import('dynamic-lib'))
            return module
          }
        `,
      },

      // ❌ Require in conditional
      {
        code: `
          if (condition) {
            const optional = require('optional-dep')
          }
        `,
        filename: 'test.ts',
        errors: [
          {
            messageId: 'missingCast',
            data: { source: 'optional-dep' },
          },
        ],
        output: `
          if (condition) {
            const optional = (require('optional-dep') as typeof import('optional-dep'))
          }
        `,
      },
    ],
  })
})
