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
          const fs = require('fs')
          const data = fs.readFileSync('/Users/joe/test.txt', 'utf8')
        `,
    },
    {
      code: `
          import fs from 'fs'
          function asd () {
            const data = fs.readFileSync('/Users/joe/test.txt', 'utf8')
          }
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
            fs.readFileSync('/Users/joe/test.txt', 'utf8')
            return
          }
        `,
    },
    {
      code: `
          import fs from 'fs';
          function NotComponent() {
            fs.readFileSync('/Users/joe/test.txt', 'utf8')
            return
          }
        `,
    },
    {
      code: `
          const TestComponent = () => {
            const a = () => {
              const b = process.env.BROWSERSLIST_CONFIG
            }
            return 123
          }
        `,
    },
    {
      code: `
          const TestComponent = () => {
            const a = () => {
              console.log('asdas')
            }
            return <div>ads</div>
          }
        `,
    },
    {
      code: `
          import fs from 'fs';
          export async function getStaticProps() {
            fs.readFileSync('/Users/joe/test.txt', 'utf8')
            return {
              props: {
                asd: 'asd'
              },
            }
          }
          function TestComponent({ asd }) {
            return <div>{asd}</div>
          }
        `,
    },
    {
      code: `
          import fs from 'fs';
          export async function getServerSideProps(context) {
            fs.readFileSync('/Users/joe/test.txt', 'utf8')
            return {
              props: {
                asd: 'asd'
              },
            }
          }
          function TestComponent({ asd }) {
            return <div>{asd}</div>
          }
        `,
    },
    {
      code: `
          import fs from 'fs';
          export async function getStaticProps() {
            fs.readFileSync('/Users/joe/test.txt', 'utf8')
            return {
              props: {
                asd: 'asd'
              },
            }
          }
          export async function getStaticPaths() {
            fs.readFileSync('/Users/joe/test.txt', 'utf8')
            const res = await fetch('https://test.com/posts')
            const posts = await res.json()
            const paths = posts.map((post) => ({
              params: { id: post.id },
            }))
            return { paths, fallback: 'blocking' }
          }
          function TestComponent({ asd }) {
            return <div>{asd}</div>
          }
        `,
    },
    {
      code: `
          import fs from 'fs';
          export default function handler(req, res) {
            fs.readFileSync('/Users/joe/test.txt', 'utf8')
            res.status(200).json({ name: 'John Doe' })
          }
        `,
      filename: 'pages/api/people/[id].js',
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
          message: `Do not use fs.readFileSync inside the react component.`,
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
          message: `Do not use fs.readFileSync inside the react component.`,
        },
      ],
    },
    {
      code: `
          import fs from 'fs';
          const TestComponent = () => {
            useEffect(() => {
              fs.readFileSync('/Users/joe/test.txt', 'utf8')
            }, [])
            return <div>afsdfasd</div>
          }
        `,
      errors: [
        {
          message: `Do not use fs.readFileSync inside the react component.`,
        },
      ],
    },
    {
      code: `
          import fs from 'fs';
          const TestComponent = () => {
            const AnotherComponent = () => {
              fs.readFileSync('/Users/joe/test.txt', 'utf8')
              return <div>ads</div>
            }
            return (
              <p>Hello</p>
            )
          }
        `,
      errors: [
        {
          message: `Do not use fs.readFileSync inside the react component.`,
        },
      ],
    },
    {
      code: `
        const TestComponent = () => {
          const a = () => {
            process.cwd()
          }
          return 123
        }
      `,
      errors: [
        {
          message: `Do not use process.cwd inside the react component.`,
        },
      ],
    },
    {
      code: `
        import os from 'os';
        const TestComponent = () => {
          const a = () => {
            const a = os.EOL
          }
          return 123
        }
      `,
      errors: [
        {
          message: `Do not use os.EOL inside the react component.`,
        },
      ],
    },
    {
      code: `
        import {EOL} from 'os';
        const TestComponent = () => {
          const a = () => {
            const a = EOL
          }
          return 123
        }
      `,
      errors: [
        {
          message: `Do not use EOL inside the react component.`,
        },
      ],
    },
    {
      code: `
      const { spawn } = require('child_process')
        const SlugPage5 = () => {
          const a = () => {
            spawn('ls', ['-lh', '/usr'])
          }
          return 123
        }
      `,
      errors: [
        {
          message: `Do not use spawn inside the react component.`,
        },
      ],
    },
    {
      code: `
        var cluster = require('cluster');
        const SlugPage9 = () => {
          const a = () => {
            cluster.fork()
          }
          return 123
        }
      `,
      errors: [
        {
          message: `Do not use cluster.fork inside the react component.`,
        },
      ],
    },
    {
      code: `
        import { spawn } from 'child_process'
        const SlugPage5 = () => {
          const a = () => {
            spawn('ls', ['-lh', '/usr']);
          }
          return 123
        }
      `,
      errors: [
        {
          message: `Do not use spawn inside the react component.`,
        },
      ],
    },
    {
      code: `
        import fs from 'fs';
        const TestComponent = () => {
          useEffect(() => {
            fs.readFileSync('/Users/joe/test.txt', 'utf8')
          }, [])
          return [<div>afsdfasd</div>]
        }
      `,
      errors: [
        {
          message: `Do not use fs.readFileSync inside the react component.`,
        },
      ],
    },
    {
      code: `
        import fs from 'fs';
        const TestComponent = () => {
          const b = () => {
            const a = () => {
              fs.readFileSync('/Users/joe/test.txt', 'utf8')
            }
          }
          return [<div>afsdfasd</div>]
        }
      `,
      errors: [
        {
          message: `Do not use fs.readFileSync inside the react component.`,
        },
      ],
    },
    {
      code: `
        import fs from 'fs';
        import path from 'path';
        const TestComponent = () => {
          const b = () => {
            const a = () => {
              fs.readFileSync('/Users/joe/test.txt', 'utf8')
            }
          }
          const c = () => {
            const filename = path.basename('/Users/joe/text.js');
          }
          return [<div>afsdfasd</div>]
        }
      `,
      errors: [
        {
          message: `Do not use fs.readFileSync inside the react component.`,
        },
        {
          message: `Do not use path.basename inside the react component.`,
        },
      ],
    },
    {
      code: `
        import fs from 'fs';
        const TestComponent = () => {
          useEffect(() => {
            fs.readFileSync('/Users/joe/test.txt', 'utf8')
          }, [])
          return null
        }
      `,
      errors: [
        {
          message: `Do not use fs.readFileSync inside the react component.`,
        },
      ],
    },
    {
      code: `
        import fs from 'fs';
        const TestComponent = () => {
          const a = () => {
            fs.readFileSync('/Users/joe/test.txt', 'utf8')
            return <div>ads</div>
          }
          return 123
        }
      `,
      errors: [
        {
          message: `Do not use fs.readFileSync inside the react component.`,
        },
      ],
    },
    {
      code: `
        import fs from 'fs';
        const TestComponent = () => {
          useEffect(() => {
            fs.readFileSync('/Users/joe/test.txt', 'utf8')
          }, [])
          return 'asd' ? <div>ads</div> : null
        }
      `,
      errors: [
        {
          message: `Do not use fs.readFileSync inside the react component.`,
        },
      ],
    },
    {
      code: `
        import fs from 'fs';
        const TestComponent = () => {
          useEffect(() => {
            fs.readFileSync('/Users/joe/test.txt', 'utf8')
          }, [])
          return true && <div>ads</div>
        }
      `,
      errors: [
        {
          message: `Do not use fs.readFileSync inside the react component.`,
        },
      ],
    },
    {
      code: `
        import fs from 'fs';
        const TestComponent = React.memo(() => {
          useEffect(() => {
            fs.readFileSync('/Users/joe/test.txt', 'utf8')
          }, [])
          return <>aasd</>
        })
      `,
      errors: [
        {
          message: `Do not use fs.readFileSync inside the react component.`,
        },
      ],
    },
    {
      code: `
        import fs from 'fs';
        const TestComponent = memo(() => {
          useEffect(() => {
            fs.readFileSync('/Users/joe/test.txt', 'utf8')
          }, [])
          return <div>aasd</div>
        })
      `,
      errors: [
        {
          message: `Do not use fs.readFileSync inside the react component.`,
        },
      ],
    },
    {
      code: `
        import fs from 'fs';
        const TestComponent = React.forwardRef((props, ref) => {
          useEffect(() => {
            fs.readFileSync('/Users/joe/test.txt', 'utf8')
          }, [])
          return <>aasd</>
        })
      `,
      errors: [
        {
          message: `Do not use fs.readFileSync inside the react component.`,
        },
      ],
    },
    {
      code: `
        import fs from 'fs';
        const TestComponent = React.forwardRef(function(props, ref){
          useEffect(() => {
            fs.readFileSync('/Users/joe/test.txt', 'utf8')
          }, [])
          return <>aasd</>
        })
      `,
      errors: [
        {
          message: `Do not use fs.readFileSync inside the react component.`,
        },
      ],
    },
    {
      code: `
        import fs from 'fs';
        const TestComponent = React.forwardRef(function(props, ref){
          useEffect(() => {
            fs.readFileSync('/Users/joe/test.txt', 'utf8')
          }, [])
          return <>aasd</>
        })
      `,
      errors: [
        {
          message: `Do not use fs.readFileSync inside the react component.`,
        },
      ],
    },
    {
      code: `
        import fs from 'fs';
        const TestComponent = React.forwardRef(function(props, ref){
          useEffect(() => {
            fs.readFileSync('/Users/joe/test.txt', 'utf8');
          }, [])
          const callback = useCallback(() => {
            fs.readFileSync('/Users/joe/test.txt', 'utf8');
          }, [])
          return <>aasd</>
        })
      `,
      errors: [
        {
          message: `Do not use fs.readFileSync inside the react component.`,
        },
        {
          message: `Do not use fs.readFileSync inside the react component.`,
        },
      ],
    },
    {
      code: `
          import lodash from 'lodash';
          const TestComponent = () => {
            const a = () => {
              lodash.get('asdas')
            }
            return <div>ads</div>
          }
        `,
      options: [
        {
          forbiddenImports: ['lodash'],
        },
      ],
      errors: [
        {
          message: `Do not use lodash.get inside the react component.`,
        },
      ],
    },
  ],
})
