import { RuleTester } from 'eslint'
import { rules } from '@next/eslint-plugin-next'

const NextESLintRule = rules['next-script-for-ga']

const url = 'https://nextjs.org/docs/messages/next-script-for-ga'
const ERROR_MSG_GOOGLE_ANALYTICS = `Prefer \`GoogleAnalytics\` component from \`@next/third-parties/google\` when using the inline script for Google Analytics. See: ${url}`
const ERROR_MSG_GOOGLE_TAG_MANAGER = `Prefer \`GoogleTagManager\` component from \`@next/third-parties/google\` when using the inline script for Google Tag Manager. See: ${url}`

const tests = {
  valid: [
    `import Script from 'next/script'

      export class Blah extends Head {
        render() {
          return (
            <div>
              <h1>Hello title</h1>
              <Script
                src="https://www.googletagmanager.com/gtag/js?id=GA_MEASUREMENT_ID"
                strategy="lazyOnload"
              />
              <Script id="google-analytics">
                {\`
                  window.dataLayer = window.dataLayer || [];
                  function gtag(){window.dataLayer.push(arguments);}
                  gtag('js', new Date());

                  gtag('config', 'GA_MEASUREMENT_ID');
                \`}
              </Script>
            </div>
          );
        }
    }`,
    `import Script from 'next/script'

      export class Blah extends Head {
        render() {
          return (
            <div>
              <h1>Hello title</h1>
              <Script id="google-analytics">
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
    `import Script from 'next/script'

        export class Blah extends Head {
        render() {
            return (
            <div>
                <h1>Hello title</h1>
                <Script id="google-analytics">
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
                <script async src='https://www.googletagmanager.com/gtag/js?id=$\{GA_TRACKING_ID}' />
                <script
                  dangerouslySetInnerHTML={{
                    __html: \`
                      window.dataLayer = window.dataLayer || [];
                      function gtag(){dataLayer.push(arguments);}
                      gtag('js', new Date());
                      gtag('config', '\${GA_TRACKING_ID}', {
                        page_path: window.location.pathname,
                      });
                  \`,
                }}/>
              </div>
            );
          }
      }`,
      errors: [
        {
          message: ERROR_MSG_GOOGLE_TAG_MANAGER,
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
          message: ERROR_MSG_GOOGLE_ANALYTICS,
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
          message: ERROR_MSG_GOOGLE_ANALYTICS,
          type: 'JSXOpeningElement',
        },
      ],
    },
    {
      code: `
        export class Blah extends Head {
          createGoogleAnalyticsMarkup() {
            return {
              __html: \`
                window.dataLayer = window.dataLayer || [];
                function gtag(){dataLayer.push(arguments);}
                gtag('js', new Date());
                gtag('config', 'UA-148481588-2');\`,
            };
          }

          render() {
            return (
              <div>
                <h1>Hello title</h1>
                <script dangerouslySetInnerHTML={this.createGoogleAnalyticsMarkup()} />
                <script async src='https://www.google-analytics.com/analytics.js'></script>
              </div>
            );
          }
      }`,
      errors: [
        {
          message: ERROR_MSG_GOOGLE_ANALYTICS,
          type: 'JSXOpeningElement',
        },
      ],
    },
  ],
}

describe('next-script-for-ga', () => {
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
    },
  }).run('eslint', NextESLintRule, tests)
})
