const rule = require('@next/eslint-plugin-next/lib/rules/image-component/missing-alt-text.js')
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
ruleTester.run('missing-alt-text', rule, {
  valid: [
    `
        import Image from 'next/image'
        export default function Page() {
            return <div>
                <Image height="150" width="100" src="foo.jpg" alt="A picture of foo" />
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
          messageId: 'missingAltText',
        },
      ],
    },
    {
      code: `
			import MyImageName from 'next/image'
			import Image from 'otherImage'
			export default function Page() {
				return <div>
					<MyImageName src="foo.jpg" />
				</div>
			}
		`,
      errors: [
        {
          messageId: 'missingAltText',
        },
      ],
    },
  ],
})
