import { css } from '../../utils/css'

export function Colors() {
  return (
    <style>
      {css`
        :host {
          /* 
           * CAUTION: THIS IS A WORKAROUND!
           * For now, we use @babel/code-frame to parse the code frame which does not support option to change the color.
           * x-ref: https://github.com/babel/babel/blob/efa52324ff835b794c48080f14877b6caf32cd15/packages/babel-code-frame/src/defs.ts#L40-L54
           * So, we do a workaround mapping to change the color matching the theme.
           *
           * For example, in @babel/code-frame, the "keyword" is mapped to ANSI "cyan".
           * We want the "keyword" to use the "syntax-keyword" color in the theme.
           * So, we map the "cyan" to the "syntax-keyword" in the theme.
           */
          /* cyan: keyword */
          --color-ansi-cyan: var(--color-syntax-keyword);
          /* yellow: capitalized, jsxIdentifier, punctuation */
          --color-ansi-yellow: var(--color-syntax-function);
          /* magenta: number, regex */
          --color-ansi-magenta: var(--color-syntax-keyword);
          /* green: string */
          --color-ansi-green: var(--color-syntax-string);
          /* gray (bright black): comment, gutter */
          --color-ansi-bright-black: var(--color-syntax-comment);

          /* Ansi - Temporary */
          --color-ansi-selection: var(--color-gray-alpha-300);
          --color-ansi-bg: var(--color-background-200);
          --color-ansi-fg: var(--color-gray-1000);

          --color-ansi-white: var(--color-gray-700);
          --color-ansi-black: var(--color-gray-200);
          --color-ansi-blue: var(--color-blue-700);
          --color-ansi-red: var(--color-red-700);
          --color-ansi-bright-white: var(--color-gray-1000);
          --color-ansi-bright-blue: var(--color-blue-800);
          --color-ansi-bright-cyan: var(--color-blue-800);
          --color-ansi-bright-green: var(--color-green-800);
          --color-ansi-bright-magenta: var(--color-blue-800);
          --color-ansi-bright-red: var(--color-red-800);
          --color-ansi-bright-yellow: var(--color-amber-900);

          /* Background Light */
          --color-background-100: #ffffff;
          --color-background-200: #fafafa;

          /* Syntax Light */
          --color-syntax-comment: #545454;
          --color-syntax-constant: #171717;
          --color-syntax-function: #0054ad;
          --color-syntax-keyword: #a51850;
          --color-syntax-link: #066056;
          --color-syntax-parameter: #8f3e00;
          --color-syntax-punctuation: #171717;
          --color-syntax-string: #036157;
          --color-syntax-string-expression: #066056;

          /* Gray Scale Light */
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

          /* Gray Alpha Scale Light */
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

          /* Blue Scale Light */
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

          /* Red Scale Light */
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

          /* Amber Scale Light */
          --color-amber-100: #fff6e5;
          --color-amber-200: #fff4d5;
          --color-amber-300: #fef0cd;
          --color-amber-400: #ffddbf;
          --color-amber-500: #ffc96b;
          --color-amber-600: #f5b047;
          --color-amber-700: #ffb224;
          --color-amber-800: #ff990a;
          --color-amber-900: #a35200;
          --color-amber-1000: #4e2009;

          /* Green Scale Light */
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

          /* Turbopack Light - Temporary */
          --color-turbopack-text-red: #ff1e56;
          --color-turbopack-text-blue: #0096ff;
          --color-turbopack-border-red: #f0adbe;
          --color-turbopack-border-blue: #adccea;
          --color-turbopack-background-red: #fff7f9;
          --color-turbopack-background-blue: #f6fbff;
        }
      `}
    </style>
  )
}
