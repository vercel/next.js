/**
 * DISCLAIMER
 *
 * The Geist theme used here may be removed or be replaced in the future.
 * It is temporary and may not be up to date with the latest Geist Scheme.
 */
import { noop as css } from '../helpers/noop-template'

export const geist = css`
  :host {
    /* Font Family */
    // TODO: Add fallback fonts
    --font-geist-sans: 'Geist';
    --font-geist-mono: 'Geist Mono';

    /* Background - Light Theme */
    --DS-Background-100: #ffffff;
    --DS-Background-200: #fafafa;

    /* Red Scale - Light Theme */
    --DS-Red-100: #fff0f0;
    --DS-Red-200: #ffebeb;
    --DS-Red-300: #ffe5e5;
    --DS-Red-400: #fddbd8;
    --DS-Red-500: #f8baba;
    --DS-Red-600: #f87274;
    --DS-Red-700: #e5484d;
    --DS-Red-800: #da3036;
    --DS-Red-900: #ca2a30;
    --DS-Red-1000: #381316;

    /* Gray Scale - Light Theme */
    --DS-Gray-100: #f2f2f2;
    --DS-Gray-200: #ebebeb;
    --DS-Gray-300: #e6e6e6;
    --DS-Gray-400: #eaeaea;
    --DS-Gray-500: #c9c9c9;
    --DS-Gray-600: #a8a8a8;
    --DS-Gray-700: #8f8f8f;
    --DS-Gray-800: #7d7d7d;
    --DS-Gray-900: #666666;
    --DS-Gray-1000: #171717;

    /* Blue Scale - Light Theme */
    --DS-Blue-100: #f0f7ff;
    --DS-Blue-200: #edf6ff;
    --DS-Blue-300: #e1f0ff;
    --DS-Blue-400: #cde7ff;
    --DS-Blue-500: #99ceff;
    --DS-Blue-600: #52aeff;
    --DS-Blue-700: #0070f3;
    --DS-Blue-800: #0060d1;
    --DS-Blue-900: #0067d6;
    --DS-Blue-1000: #00254d;

    /* Syntax Colors - Light Theme */
    --DS-Syntax-Comment: #666666;
    --DS-Syntax-Constant: #171717;
    --DS-Syntax-Function: #0068d6;
    --DS-Syntax-Keyword: #c01b5d;
    --DS-Syntax-Link: #067a6e;
    --DS-Syntax-Parameter: #ad4800;
    --DS-Syntax-Punctuation: #171717;
    --DS-Syntax-String: #067a6e;
    --DS-Syntax-StringExpression: #067a6e;
  }

  @media (prefers-color-scheme: dark) {
    :host {
      /* Background - Dark Theme */
      --DS-Background-100: #0a0a0a;
      --DS-Background-200: #000000;

      /* Red Scale - Dark Theme */
      --DS-Red-100: #2a1314;
      --DS-Red-200: #3d1719;
      --DS-Red-300: #551a1e;
      --DS-Red-400: #671e22;
      --DS-Red-500: #822025;
      --DS-Red-600: #e5484d;
      --DS-Red-700: #e5484d;
      --DS-Red-800: #da3036;
      --DS-Red-900: #ff6369;
      --DS-Red-1000: #feecee;

      /* Gray Scale - Dark Theme */
      --DS-Gray-100: #1a1a1a;
      --DS-Gray-200: #1f1f1f;
      --DS-Gray-300: #292929;
      --DS-Gray-400: #2e2e2e;
      --DS-Gray-500: #454545;
      --DS-Gray-600: #878787;
      --DS-Gray-700: #8f8f8f;
      --DS-Gray-800: #7d7d7d;
      --DS-Gray-900: #a0a0a0;
      --DS-Gray-1000: #ededed;

      /* Blue Scale - Dark Theme */
      --DS-Blue-100: #0f1b2d;
      --DS-Blue-200: #10243e;
      --DS-Blue-300: #0f305b;
      --DS-Blue-400: #0d3868;
      --DS-Blue-500: #0a4481;
      --DS-Blue-600: #0091ff;
      --DS-Blue-700: #0070f3;
      --DS-Blue-800: #0060d1;
      --DS-Blue-900: #52a9ff;
      --DS-Blue-1000: #eaf6ff;

      /* Syntax Colors - Dark Theme */
      --DS-Syntax-Comment: #ad0a0a;
      --DS-Syntax-Constant: #ededed;
      --DS-Syntax-Function: #52a9ff;
      --DS-Syntax-Keyword: #f76191;
      --DS-Syntax-Link: #0ac5b2;
      --DS-Syntax-Parameter: #f1a10d;
      --DS-Syntax-Punctuation: #ededed;
      --DS-Syntax-String: #0ac5b2;
      --DS-Syntax-StringExpression: #0ac5b2;
    }
  }
`
