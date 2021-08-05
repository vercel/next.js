const path = require('path')
const rule = require('@next/eslint-plugin-next/lib/rules/no-server-modules-on-client-side')
const RuleTester = require('eslint').RuleTester

const NODE_MODULES = '../../node_modules'
const BABEL_ESLINT = path.join(__dirname, NODE_MODULES, '@babel/eslint-parser')

RuleTester.setDefaultConfig({
  parser: ['@babel/eslint-parser'],
  plugins: ['react', 'react-hooks', 'jest', 'import'],
  parserOptions: {
    ecmaVersion: 2020,
    requireConfigFile: false,
    sourceType: 'module',
    ecmaFeatures: {
      jsx: true,
    },
    babelOptions: {
      presets: ['@babel/preset-env', '@babel/preset-react'],
      caller: {
        supportsTopLevelAwait: true,
      },
    },
  },
})

var ruleTester = new RuleTester()
ruleTester.run('no-server-modules-on-client-side', rule, {
  valid: [
    {
      code: `
        import fs from 'fs'
        const data = fs.readFileSync('/Users/joe/test.txt', 'utf8')
      `,
    },
    {
      code: `
        import fs from 'fs'
        class TestComponent extends React.Component {
          render() {
            return <div>asd</div>
          }
        }
      `,
    },
    {
      code: `
        import fs from 'fs';
        const NotComponent = () => {
          fs();

          return
        }
      `,
    },
    {
      code: `
        import fs from 'fs';
        function NotComponent() {
          fs();

          return
        }
      `,
    },
  ],
  invalid: [
    {
      code: `
        import fs from 'fs';
        class TestComponent extends React.Component {
          componentDidMount() {
            try {
              const data = fs.readFileSync('/Users/joe/test.txt', 'utf8')
              console.log(data)
            } catch (err) {
              console.error(err)
            }
          }
          render() {
            return <div>asd</div>
          }
        }
      `,
      errors: [
        {
          message: `Do not call fs from the react component.`,
        },
      ],
    },
    {
      code: `
        import fs from 'fs';
        class TestComponent extends PureComponent {
          someFunc = () => {
            try {
              const data = fs.readFileSync('/Users/joe/test.txt', 'utf8')
              console.log(data)
            } catch (err) {
              console.error(err)
            }
          }
          render() {
            return <div>asd</div>
          }
        }
      `,
      parser: BABEL_ESLINT,
      errors: [
        {
          message: `Do not call fs from the react component.`,
        },
      ],
    },
    {
      code: `
        import fs from 'fs';
        const TestComponent = () => {
          useEffect(() => {
            fs();
          }, [])

          return <div>afsdfasd</div>
        }
      `,
      errors: [
        {
          message: `Do not call fs from the react component.`,
        },
      ],
    },
    {
      code: `
        import fs from 'fs';
        const TestComponent = () => {
          useEffect(() => {
            fs();
          }, [])

          return [<div>afsdfasd</div>]
        }
      `,
      errors: [
        {
          message: `Do not call fs from the react component.`,
        },
      ],
    },
    {
      code: `
        import fs from 'fs';
        const TestComponent = () => {
          const b = () => {
            const a = () => {
              fs();
            }
          }

          return [<div>afsdfasd</div>]
        }
      `,
      errors: [
        {
          message: `Do not call fs from the react component.`,
        },
      ],
    },
    {
      code: `
        import fs from 'fs';
        const TestComponent = () => {
          useEffect(() => {
            fs();
          }, [])

          return null
        }
      `,
      errors: [
        {
          message: `Do not call fs from the react component.`,
        },
      ],
    },
    {
      code: `
        import fs from 'fs';
        const TestComponent = () => {
          useEffect(() => {
            fs();
          }, [])

          return 'asd' ? <div>ads</div> : null
        }
      `,
      errors: [
        {
          message: `Do not call fs from the react component.`,
        },
      ],
    },
    {
      code: `
        import fs from 'fs';
        const TestComponent = () => {
          useEffect(() => {
            fs();
          }, [])

          return true && <div>ads</div>
        }
      `,
      errors: [
        {
          message: `Do not call fs from the react component.`,
        },
      ],
    },
    {
      code: `
        import fs from 'fs';
        const TestComponent = React.memo(() => {
          useEffect(() => {
            fs();
          }, [])
          
          return <>aasd</>
        })
      `,
      errors: [
        {
          message: `Do not call fs from the react component.`,
        },
      ],
    },
    {
      code: `
        import fs from 'fs';
        const TestComponent = React.forwardRef((props, ref) => {
          useEffect(() => {
            fs();
          }, [])
          
          return <>aasd</>
        })
      `,
      errors: [
        {
          message: `Do not call fs from the react component.`,
        },
      ],
    },
    {
      code: `
        import fs from 'fs';
        const TestComponent = React.forwardRef(function(props, ref){
          useEffect(() => {
            fs();
          }, [])
          
          return <>aasd</>
        })
      `,
      errors: [
        {
          message: `Do not call fs from the react component.`,
        },
      ],
    },
  ],
})
