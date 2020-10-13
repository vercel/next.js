const rule = require('@next/eslint-plugin-next/lib/rules/image-component/no-unsized-images.js')
const RuleTester = require('eslint').RuleTester

RuleTester.setDefaultConfig({
  parserOptions: {
    ecmaVersion: 2018,
    sourceType: 'module',
    ecmaFeatures: {
      modules: true,
      jsx: true,
    },
  },
})

var ruleTester = new RuleTester()
ruleTester.run('no-unsized-images', rule, {
  valid: [
    `
      import Image from 'next/image'
      export default function Page() {
        return <div>
          <Image height="150" width="100" src="foo.jpg" />
        </div>
      }
    `,
    `
      import Image from 'next/image'
      export default function Page() {
        return <div>
          <Image unsized src="foo.jpg" />
        </div>
      }
    `,
    `
      import MyImageName from 'next/image'
      import Image from 'otherImage'
      export default function Page() {
        return <div>
          <Image src="foo.jpg" />
        </div>
      }
    `,
    `
      import MyImageName from 'next/image'
      export default function Page() {
        return <div>
          <MyImageName src="foo.jpg" height="150" width="100" src="foo.jpg"/>
        </div>
      }
    `,
  ],
  invalid: [
    {
      code: `
        import Image from 'next/image'
        export default function Page() {
          return <div>
            <Image src="foo.jpg" />
          </div>
        }
      `,
      errors: [
        {
          messageId: 'unsizedImages',
        },
      ],
    },
    {
      code: `
        import Image from 'next/image'
        export default function Page() {
          return <div>
            <Image height="100" src="foo.jpg" />
          </div>
        }
      `,
      errors: [
        {
          messageId: 'unsizedImages',
        },
      ],
    },
    {
      code: `
        import Image from 'next/image'
        export default function Page() {
          return <div>
            <Image height width src="foo.jpg" />
          </div>
        }
      `,
      errors: [
        {
          messageId: 'unsizedImages',
        },
      ],
    },
    {
      code: `
        import Image from 'next/image'
        export default function Page() {
          return <div>
            <Image height="" width="" src="foo.jpg" />
          </div>
        }
      `,
      errors: [
        {
          messageId: 'unsizedImages',
        },
      ],
    },
    {
      code: `
        import Image from 'next/image'
        export default function Page() {
          return <div>
            <Image width="100" src="foo.jpg" />
          </div>
        }
      `,
      errors: [
        {
          messageId: 'unsizedImages',
        },
      ],
    },
    {
      code: `
        import MyImageName from 'next/image'
        import Image from 'otherImage'
        export default function Page() {
          return <div>
            <MyImageName height="100" src="foo.jpg" />
          </div>
        }
      `,
      errors: [
        {
          messageId: 'unsizedImages',
        },
      ],
    },
  ],
})
