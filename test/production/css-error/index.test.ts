import { nextBuild } from 'next-test-utils'
import { join } from 'path'
import stripAnsi from 'strip-ansi'

describe('app dir - css', () => {
  describe('css support', () => {
    const appDir = join(__dirname)

    // css-loader does not report an error for this case
    ;(process.env.TURBOPACK ? describe : describe.skip)(
      'error handling',
      () => {
        it('should report human-readable error message for css', async () => {
          const { stderr } = await nextBuild(appDir, [], { stderr: true })

          expect(stripAnsi(stderr)).toMatchInlineSnapshot(`
            " ⚠ Linting is disabled.

            > Build error occurred
            Error: Turbopack build failed with 15 errors:
            Page: {"type":"pages","side":"server","page":"_app"}
            ./test/production/css-error/app/global.css:9:8
            Parsing css source code failed
               7 |   &.header {
               8 |     /* Correct syntax: &.darktheme */
            >  9 |     &:darktheme {
                 |        ^
              10 |       border-bottom-color: var(--accents-2);
              11 |     }
              12 |   }

            Unsupported pseudo class or element: darktheme at [project]/test/production/css-error/app/global.css:8:7


            Page: {"type":"pages","side":"server","page":"_app"}
            ./test/production/css-error/app/global.css:15:13
            Parsing css source code failed
              13 |
              14 |   /* Correct syntax: &.global(.dark-theme) */
            > 15 |   &:global(.dark-theme) & {
                 |             ^
              16 |     background: linear-gradient(transparent 0%, rgba(0, 0, 0, 0.5) 100%);
              17 |   }
              18 | }

            Unsupported pseudo class or element: global at [project]/test/production/css-error/app/global.css:14:12


            Page: {"type":"pages","side":"server","page":"_app"}
            ./test/production/css-error/app/global.css:2:8
            Parsing css source code failed
              1 | /* Correct syntax: input::placeholder */ 
            > 2 | input:placeholder {
                |        ^
              3 |   color: red;
              4 | }
              5 |

            Unsupported pseudo class or element: placeholder at [project]/test/production/css-error/app/global.css:1:7


            Page: {"type":"pages","side":"server","page":"_document"}
            ./test/production/css-error/app/global.css:9:8
            Parsing css source code failed
               7 |   &.header {
               8 |     /* Correct syntax: &.darktheme */
            >  9 |     &:darktheme {
                 |        ^
              10 |       border-bottom-color: var(--accents-2);
              11 |     }
              12 |   }

            Unsupported pseudo class or element: darktheme at [project]/test/production/css-error/app/global.css:8:7


            Page: {"type":"pages","side":"server","page":"_document"}
            ./test/production/css-error/app/global.css:15:13
            Parsing css source code failed
              13 |
              14 |   /* Correct syntax: &.global(.dark-theme) */
            > 15 |   &:global(.dark-theme) & {
                 |             ^
              16 |     background: linear-gradient(transparent 0%, rgba(0, 0, 0, 0.5) 100%);
              17 |   }
              18 | }

            Unsupported pseudo class or element: global at [project]/test/production/css-error/app/global.css:14:12


            Page: {"type":"pages","side":"server","page":"_document"}
            ./test/production/css-error/app/global.css:2:8
            Parsing css source code failed
              1 | /* Correct syntax: input::placeholder */ 
            > 2 | input:placeholder {
                |        ^
              3 |   color: red;
              4 | }
              5 |

            Unsupported pseudo class or element: placeholder at [project]/test/production/css-error/app/global.css:1:7


            Page: {"type":"pages","side":"server","page":"_error"}
            ./test/production/css-error/app/global.css:9:8
            Parsing css source code failed
               7 |   &.header {
               8 |     /* Correct syntax: &.darktheme */
            >  9 |     &:darktheme {
                 |        ^
              10 |       border-bottom-color: var(--accents-2);
              11 |     }
              12 |   }

            Unsupported pseudo class or element: darktheme at [project]/test/production/css-error/app/global.css:8:7


            Page: {"type":"pages","side":"server","page":"_error"}
            ./test/production/css-error/app/global.css:15:13
            Parsing css source code failed
              13 |
              14 |   /* Correct syntax: &.global(.dark-theme) */
            > 15 |   &:global(.dark-theme) & {
                 |             ^
              16 |     background: linear-gradient(transparent 0%, rgba(0, 0, 0, 0.5) 100%);
              17 |   }
              18 | }

            Unsupported pseudo class or element: global at [project]/test/production/css-error/app/global.css:14:12


            Page: {"type":"pages","side":"server","page":"_error"}
            ./test/production/css-error/app/global.css:2:8
            Parsing css source code failed
              1 | /* Correct syntax: input::placeholder */ 
            > 2 | input:placeholder {
                |        ^
              3 |   color: red;
              4 | }
              5 |

            Unsupported pseudo class or element: placeholder at [project]/test/production/css-error/app/global.css:1:7


            Page: {"type":"app","side":"server","page":"/css-error/page"}
            ./test/production/css-error/app/global.css:9:8
            Parsing css source code failed
               7 |   &.header {
               8 |     /* Correct syntax: &.darktheme */
            >  9 |     &:darktheme {
                 |        ^
              10 |       border-bottom-color: var(--accents-2);
              11 |     }
              12 |   }

            Unsupported pseudo class or element: darktheme at [project]/test/production/css-error/app/global.css:8:7


            Page: {"type":"app","side":"server","page":"/css-error/page"}
            ./test/production/css-error/app/global.css:15:13
            Parsing css source code failed
              13 |
              14 |   /* Correct syntax: &.global(.dark-theme) */
            > 15 |   &:global(.dark-theme) & {
                 |             ^
              16 |     background: linear-gradient(transparent 0%, rgba(0, 0, 0, 0.5) 100%);
              17 |   }
              18 | }

            Unsupported pseudo class or element: global at [project]/test/production/css-error/app/global.css:14:12


            Page: {"type":"app","side":"server","page":"/css-error/page"}
            ./test/production/css-error/app/global.css:2:8
            Parsing css source code failed
              1 | /* Correct syntax: input::placeholder */ 
            > 2 | input:placeholder {
                |        ^
              3 |   color: red;
              4 | }
              5 |

            Unsupported pseudo class or element: placeholder at [project]/test/production/css-error/app/global.css:1:7


            Page: {"type":"app","side":"server","page":"/_not-found/page"}
            ./test/production/css-error/app/global.css:9:8
            Parsing css source code failed
               7 |   &.header {
               8 |     /* Correct syntax: &.darktheme */
            >  9 |     &:darktheme {
                 |        ^
              10 |       border-bottom-color: var(--accents-2);
              11 |     }
              12 |   }

            Unsupported pseudo class or element: darktheme at [project]/test/production/css-error/app/global.css:8:7


            Page: {"type":"app","side":"server","page":"/_not-found/page"}
            ./test/production/css-error/app/global.css:15:13
            Parsing css source code failed
              13 |
              14 |   /* Correct syntax: &.global(.dark-theme) */
            > 15 |   &:global(.dark-theme) & {
                 |             ^
              16 |     background: linear-gradient(transparent 0%, rgba(0, 0, 0, 0.5) 100%);
              17 |   }
              18 | }

            Unsupported pseudo class or element: global at [project]/test/production/css-error/app/global.css:14:12


            Page: {"type":"app","side":"server","page":"/_not-found/page"}
            ./test/production/css-error/app/global.css:2:8
            Parsing css source code failed
              1 | /* Correct syntax: input::placeholder */ 
            > 2 | input:placeholder {
                |        ^
              3 |   color: red;
              4 | }
              5 |

            Unsupported pseudo class or element: placeholder at [project]/test/production/css-error/app/global.css:1:7


                at turbopackBuild (/Users/kdy1/projects/next-css/packages/next/dist/build/index.js:900:27)
                at async /Users/kdy1/projects/next-css/packages/next/dist/build/index.js:933:89
                at async Span.traceAsyncFn (/Users/kdy1/projects/next-css/packages/next/dist/trace/trace.js:157:20)
                at async build (/Users/kdy1/projects/next-css/packages/next/dist/build/index.js:333:9)
            "
          `)
        })
      }
    )
  })
})
