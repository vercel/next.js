import { RuleTester } from 'eslint'
import { rules } from '@next/eslint-plugin-next'

const NextESLintRule = rules['no-img-element']

const message =
  'Using `<img>` could result in slower LCP and higher bandwidth. Consider using `<Image />` from `next/image` or a custom image loader to automatically optimize images. This may incur additional usage or cost from your provider. See: https://nextjs.org/docs/messages/no-img-element'

const tests = {
  valid: [
    `import { Image } from 'next/image';

      export class MyComponent {
        render() {
          return (
            <div>
              <Image
                src="/test.png"
                alt="Test picture"
                width={500}
                height={500}
              />
            </div>
          );
        }
      }`,
    `export class MyComponent {
        render() {
          return (
            <picture>
              <img
                src="/test.png"
                alt="Test picture"
                width={500}
                height={500}
              />
            </picture>
          );
        }
      }`,
    `export class MyComponent {
        render() {
          return (
            <div>
              <picture>
                <source media="(min-width:650px)" srcset="/test.jpg"/>
                <img
                  src="/test.png"
                  alt="Test picture"
                  style="width:auto;"
                />
              </picture>
            </div>
          );
        }
      }`,
    {
      code: `\
import { ImageResponse } from "next/og";

export default function icon() {
  return new ImageResponse(
    (
      <img
        alt="avatar"
        style={{ borderRadius: "100%" }}
        width="100%"
        height="100%"
        src="https://example.com/image.png"
      />
    )
  );
}
`,
      filename: `src/app/icon.js`,
    },
    {
      code: `\
import { ImageResponse } from "next/og";

export default function Image() {
  return new ImageResponse(
    (
      <img
        alt="avatar"
        style={{ borderRadius: "100%" }}
        width="100%"
        height="100%"
        src="https://example.com/image.png"
      />
    )
  );
}
`,
      filename: `app/opengraph-image.tsx`,
    },
  ],
  invalid: [
    {
      code: `
      export class MyComponent {
        render() {
          return (
            <div>
              <img
                src="/test.png"
                alt="Test picture"
                width={500}
                height={500}
              />
            </div>
          );
        }
      }`,
      errors: [{ message, type: 'JSXOpeningElement' }],
    },
    {
      code: `
      export class MyComponent {
        render() {
          return (
            <img
              src="/test.png"
              alt="Test picture"
              width={500}
              height={500}
            />
          );
        }
      }`,
      errors: [{ message, type: 'JSXOpeningElement' }],
    },
    {
      code: `\
import { ImageResponse } from "next/og";

export default function Image() {
return new ImageResponse(
  (
    <img
      alt="avatar"
      style={{ borderRadius: "100%" }}
      width="100%"
      height="100%"
      src="https://example.com/image.png"
    />
  )
);
}
`,
      filename: `some/non-metadata-route-image.tsx`,
      errors: [{ message, type: 'JSXOpeningElement' }],
    },
    // TODO: This documents a bug. The metadata route exemption is derived from
    // a path that is only made relative to the ESLint `cwd`, so an `app`
    // directory that does not sit directly under the `cwd` (e.g. a workspace
    // of a monorepo linted from the repository root) is not recognized as an
    // app directory, and the `<img>` that `ImageResponse` requires is still
    // reported. Once the metadata route is detected from the route path
    // itself, this case should move to `valid`.
    {
      code: `\
import { ImageResponse } from "next/og";

export default function Image() {
  return new ImageResponse(
    (
      <img
        alt="avatar"
        style={{ borderRadius: "100%" }}
        width="100%"
        height="100%"
        src="https://example.com/image.png"
      />
    )
  );
}
`,
      filename: `apps/web/app/opengraph-image.tsx`,
      errors: [{ message, type: 'JSXOpeningElement' }],
    },
  ],
}

describe('no-img-element', () => {
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
