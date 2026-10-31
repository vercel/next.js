import { RuleTester } from 'eslint'
import { rules } from '@next/eslint-plugin-next'

const NextESLintRule = rules['image-alt-text']

const missingAlt = (name: string) => ({
  messageId: 'missingAlt',
  data: { name },
})

const invalidAlt = (name: string) => ({
  messageId: 'invalidAlt',
  data: { name },
})

describe('image-alt-text', () => {
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
  }).run('eslint', NextESLintRule, {
    valid: [
      `import Image from 'next/image';
      export default () => <Image src="/a.png" alt="A" width={1} height={1} />`,
      // Empty alt is valid for decorative images
      `import Image from 'next/image';
      export default () => <Image src="/a.png" alt="" width={1} height={1} />`,
      `import Image from 'next/image';
      export default ({ text }) => <Image src="/a.png" alt={text} />`,
      `import Image from 'next/image';
      export default ({ text }) => <Image src="/a.png" alt={\`\${text} photo\`} />`,
      `import Image from 'next/legacy/image';
      export default () => <Image src="/a.png" alt="A" />`,
      `import Image from 'next/image';
      export default () => <Image src="/a.png" aria-label="A" />`,
      `import Image from 'next/image';
      export default () => <Image src="/a.png" aria-labelledby="label" />`,
      // Spread props may contain alt
      `import Image from 'next/image';
      export default (props) => <Image {...props} unoptimized />`,
      // Components named Image from other packages are not checked
      `import { Image } from 'lucide-react';
      export default () => <Image size={16} />`,
      `import { Image } from 'expo-image';
      export default () => <Image source="/a.png" />`,
      `const Image = () => null;
      export default () => <Image />`,
      // Local binding shadows the import
      `import Image from 'next/image';
      export default function Page({ Image }) { return <Image /> }`,
      // Not a default import
      `import { getImageProps } from 'next/image';
      const Image = (p) => <img {...p} />;
      export default () => <Image />`,
      // Plain <img> is left to jsx-a11y/alt-text
      `export default () => <img src="/a.png" />`,
    ],
    invalid: [
      {
        code: `import Image from 'next/image';
        export default () => <Image src="/a.png" width={1} height={1} />`,
        errors: [missingAlt('Image')],
      },
      {
        code: `import NextImage from 'next/image';
        export default () => <NextImage src="/a.png" width={1} height={1} />`,
        errors: [missingAlt('NextImage')],
      },
      {
        code: `import { default as Img } from 'next/image';
        export default () => <Img src="/a.png" />`,
        errors: [missingAlt('Img')],
      },
      {
        code: `import LegacyImage from 'next/legacy/image';
        export default () => <LegacyImage src="/a.png" />`,
        errors: [missingAlt('LegacyImage')],
      },
      {
        code: `import * as NextImage from 'next/image';
        export default () => <NextImage.default src="/a.png" />`,
        errors: [missingAlt('NextImage.default')],
      },
      {
        code: `import Image from 'next/image';
        export default () => <Image src="/a.png">{null}</Image>`,
        errors: [missingAlt('Image')],
      },
      {
        code: `import Image from 'next/image';
        export default () => <Image src="/a.png" alt={undefined} />`,
        errors: [invalidAlt('Image')],
      },
      {
        code: `import Image from 'next/image';
        export default () => <Image src="/a.png" alt={null} />`,
        errors: [invalidAlt('Image')],
      },
      {
        code: `import Image from 'next/image';
        export default () => <Image src="/a.png" alt={false} />`,
        errors: [invalidAlt('Image')],
      },
      {
        code: `import Image from 'next/image';
        export default () => <Image src="/a.png" alt />`,
        errors: [invalidAlt('Image')],
      },
      {
        code: `import Image from 'next/image';
        export default () => <Image src="/a.png" aria-label="" />`,
        errors: [missingAlt('Image')],
      },
    ],
  })
})
