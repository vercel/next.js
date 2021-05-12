const rule = require('@next/eslint-plugin-next/lib/rules/next-script-for-ga')

const RuleTester = require('eslint').RuleTester

const ERROR_MSG =
  'Use the Script component for loading third party scripts. See: https://nextjs.org/docs/messages/next-script-for-ga.'

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
ruleTester.run('sync-scripts', rule, {
  valid: [
    `import Script from 'next/experimental-script'

      export class Blah extends Head {
        render() {
          return (
            <div>
              <h1>Hello title</h1>
              <Script>
                {\`(function(i,s,o,g,r,a,m){i['GoogleAnalyticsObject']=r;i[r]=i[r]||function(){
                    (i[r].q=i[r].q||[]).push(arguments)},i[r].l=1*new Date();a=s.createElement(o),
                    m=s.getElementsByTagName(o)[0];a.async=1;a.src=g;m.parentNode.insertBefore(a,m)
                    })(window,document,'script','https://www.google-analytics.com/analytics.js','ga');
                    
                    ga('create', 'UA-XXXXX-Y', 'auto');
                    ga('send', 'pageview');
                })\`}
              </Script>
            </div>
          );
        }
    }`,
    `import Script from 'next/experimental-script'

        export class Blah extends Head {
        render() {
            return (
            <div>
                <h1>Hello title</h1>
                <Script>
                    {\`window.ga=window.ga||function(){(ga.q=ga.q||[]).push(arguments)};ga.l=+new Date;
                    ga('create', 'UA-XXXXX-Y', 'auto');
                    ga('send', 'pageview');
                    })\`}
                </Script>
            </div>
            );
        }
    }`,
    `export class Blah extends Head {
          render() {
            return (
              <div>
                <h1>Hello title</h1>
                <script dangerouslySetInnerHTML={{}} />
              </div>
            );
          }
      }`,
  ],

  invalid: [
    {
      code: `
        export class Blah extends Head {
          render() {
            return (
              <div>
                <h1>Hello title</h1>
                <script dangerouslySetInnerHTML={{
                    __html: \`
                      (function(i,s,o,g,r,a,m){i['GoogleAnalyticsObject']=r;i[r]=i[r]||function(){
                        (i[r].q=i[r].q||[]).push(arguments)},i[r].l=1*new Date();a=s.createElement(o),
                        m=s.getElementsByTagName(o)[0];a.async=1;a.src=g;m.parentNode.insertBefore(a,m)
                        })(window,document,'script','https://www.google-analytics.com/analytics.js','ga');
            
                        ga('create', 'UA-XXXXX-Y', 'auto');
                        ga('send', 'pageview');
                    \`,
                  }}/>
              </div>
            );
          }
      }`,
      errors: [
        {
          message: ERROR_MSG,
          type: 'JSXOpeningElement',
        },
      ],
    },
    {
      code: `
        export class Blah extends Head {
          render() {
            return (
              <div>
                <h1>Hello title</h1>
                <script dangerouslySetInnerHTML={{
                    __html: \`
                        window.ga=window.ga||function(){(ga.q=ga.q||[]).push(arguments)};ga.l=+new Date;
                        ga('create', 'UA-XXXXX-Y', 'auto');
                        ga('send', 'pageview');
                    \`,
                  }}/>
                <script async src='https://www.google-analytics.com/analytics.js'></script>
              </div>
            );
          }
      }`,
      errors: [
        {
          message: ERROR_MSG,
          type: 'JSXOpeningElement',
        },
      ],
    },
  ],
})
