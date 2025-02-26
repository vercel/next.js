import { css } from '../../utils/css'

const colors = `
  /* Background Dark */
  --color-background-100: #0a0a0a;
  --color-background-200: #000000;

  /* Syntax Dark */
  --color-syntax-comment: #a0a0a0;
  --color-syntax-constant: #ededed;
  --color-syntax-function: #52a9ff;
  --color-syntax-keyword: #f76e99;
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

  /* Amber Scale Dark */
  --color-amber-100: #271700;
  --color-amber-200: #341c00;
  --color-amber-300: #4a2900;
  --color-amber-400: #573300;
  --color-amber-500: #693f05;
  --color-amber-600: #e79c13;
  --color-amber-700: #ffb224;
  --color-amber-800: #ff990a;
  --color-amber-900: #f1a10d;
  --color-amber-1000: #fef3dd;

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

  /* Turbopack Dark - Temporary */
  --color-turbopack-text-red: #ff6d92;
  --color-turbopack-text-blue: #45b2ff;
  --color-turbopack-border-red: #6e293b;
  --color-turbopack-border-blue: #284f80;
  --color-turbopack-background-red: #250d12;
  --color-turbopack-background-blue: #0a1723;
`

const base = `
  --color-font: white;
  --color-backdrop: rgba(0, 0, 0, 0.8);
  --color-border-shadow: rgba(255, 255, 255, 0.145);

  --color-title-color: #fafafa;
  --color-stack-notes: #a9a9a9;
`

export function DarkTheme() {
  return (
    <style>{css`
      :host(.dark) {
        ${base}
        ${colors}

      @media (prefers-color-scheme: dark) {
        :host(:not(.light)) {
          ${base}
          ${colors}
      }
    `}</style>
  )
}
