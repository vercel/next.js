import { noop as css } from '../helpers/noop-template'

// TODO: Replace the existing colors in Base.tsx.
export function Colors() {
  return (
    <style>
      {css`
        :host {
          /* Background */
          --color-background-100: #ffffff;
          --color-background-200: #fafafa;

          /* Syntax */
          --color-syntax-comment: #666666;
          --color-syntax-constant: #171717;
          --color-syntax-function: #0068d6;
          --color-syntax-keyword: #c01b5d;
          --color-syntax-link: #067a6e;
          --color-syntax-parameter: #ad4b00;
          --color-syntax-punctuation: #171717;
          --color-syntax-string: #067a6e;
          --color-syntax-string-expression: #067a6e;

          /* Gray Scale */
          --color-gray-100: #f2f2f2;
          --color-gray-200: #ebebeb;
          --color-gray-300: #e6e6e6;
          --color-gray-400: #eaeaea;
          --color-gray-500: #c9c9c9;
          --color-gray-600: #a8a8a8;
          --color-gray-700: #8f8f8f;
          --color-gray-800: #7d7d7d;
          --color-gray-900: #666666;
          --color-gray-1000: #171717;

          /* Gray Alpha Scale */
          --color-gray-alpha-100: rgba(0, 0, 0, 0.05);
          --color-gray-alpha-200: rgba(0, 0, 0, 0.081);
          --color-gray-alpha-300: rgba(0, 0, 0, 0.1);
          --color-gray-alpha-400: rgba(0, 0, 0, 0.08);
          --color-gray-alpha-500: rgba(0, 0, 0, 0.21);
          --color-gray-alpha-600: rgba(0, 0, 0, 0.34);
          --color-gray-alpha-700: rgba(0, 0, 0, 0.44);
          --color-gray-alpha-800: rgba(0, 0, 0, 0.51);
          --color-gray-alpha-900: rgba(0, 0, 0, 0.605);
          --color-gray-alpha-1000: rgba(0, 0, 0, 0.91);

          /* Blue Scale */
          --color-blue-100: #f0f7ff;
          --color-blue-200: #edf6ff;
          --color-blue-300: #e1f0ff;
          --color-blue-400: #cde7ff;
          --color-blue-500: #99ceff;
          --color-blue-600: #52aeff;
          --color-blue-700: #0070f3;
          --color-blue-800: #0060d1;
          --color-blue-900: #0067d6;
          --color-blue-1000: #0025ad;

          /* Red Scale */
          --color-red-100: #fff0f0;
          --color-red-200: #ffebeb;
          --color-red-300: #ffe5e5;
          --color-red-400: #fdd8d8;
          --color-red-500: #f8baba;
          --color-red-600: #f87274;
          --color-red-700: #e5484d;
          --color-red-800: #da3036;
          --color-red-900: #ca2a30;
          --color-red-1000: #381316;

          /* Green Scale */
          --color-green-100: #effbef;
          --color-green-200: #eafaea;
          --color-green-300: #dcf6dc;
          --color-green-400: #c8f1c9;
          --color-green-500: #99e59f;
          --color-green-600: #6cda76;
          --color-green-700: #46a758;
          --color-green-800: #388e4a;
          --color-green-900: #297c3b;
          --color-green-1000: #18311e;
        }

        @media (prefers-color-scheme: dark) {
          :host {
            /* Background Dark */
            --color-background-100: #0a0a0a;
            --color-background-200: #000000;

            /* Syntax Dark */
            --color-syntax-comment: #a0a0a0;
            --color-syntax-constant: #ededed;
            --color-syntax-function: #52a9ff;
            --color-syntax-keyword: #f76191;
            --color-syntax-link: #0ac5b2;
            --color-syntax-parameter: #f1a10d;
            --color-syntax-punctuation: #ededed;
            --color-syntax-string: #0ac5b2;
            --color-syntax-string-expression: #0ac5b2;

            /* Gray Scale Dark */
            --color-gray-100: #1a1a1a;
            --color-gray-200: #1f1f1f;
            --color-gray-300: #292929;
            --color-gray-400: #2e2e2e;
            --color-gray-500: #454545;
            --color-gray-600: #878787;
            --color-gray-700: #8f8f8f;
            --color-gray-800: #7d7d7d;
            --color-gray-900: #a0a0a0;
            --color-gray-1000: #ededed;

            /* Gray Alpha Scale Dark */
            --color-gray-alpha-100: rgba(255, 255, 255, 0.066);
            --color-gray-alpha-200: rgba(255, 255, 255, 0.087);
            --color-gray-alpha-300: rgba(255, 255, 255, 0.125);
            --color-gray-alpha-400: rgba(255, 255, 255, 0.145);
            --color-gray-alpha-500: rgba(255, 255, 255, 0.239);
            --color-gray-alpha-600: rgba(255, 255, 255, 0.506);
            --color-gray-alpha-700: rgba(255, 255, 255, 0.54);
            --color-gray-alpha-800: rgba(255, 255, 255, 0.47);
            --color-gray-alpha-900: rgba(255, 255, 255, 0.61);
            --color-gray-alpha-1000: rgba(255, 255, 255, 0.923);

            /* Blue Scale Dark */
            --color-blue-100: #0f1b2d;
            --color-blue-200: #10243e;
            --color-blue-300: #0f3058;
            --color-blue-400: #0d3868;
            --color-blue-500: #0a4481;
            --color-blue-600: #0091ff;
            --color-blue-700: #0070f3;
            --color-blue-800: #0060d1;
            --color-blue-900: #52a9ff;
            --color-blue-1000: #eaf6ff;

            /* Red Scale Dark */
            --color-red-100: #2a1314;
            --color-red-200: #3d1719;
            --color-red-300: #551a1e;
            --color-red-400: #671e22;
            --color-red-500: #822025;
            --color-red-600: #e5484d;
            --color-red-700: #e5484d;
            --color-red-800: #da3036;
            --color-red-900: #ff6369;
            --color-red-1000: #ffecee;

            /* Green Scale Dark */
            --color-green-100: #0b2211;
            --color-green-200: #0f2c17;
            --color-green-300: #11351b;
            --color-green-400: #0c461b;
            --color-green-500: #126427;
            --color-green-600: #1a9338;
            --color-green-700: #46a758;
            --color-green-800: #388e4a;
            --color-green-900: #63c174;
            --color-green-1000: #e5fbeb;
          }
        }
      `}
    </style>
  )
}
