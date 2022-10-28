/**
 * Required files for a given project template.
 */
export const projectFiles = {
  /**
   * Files common to all Next.js templates.
   */
  global: ['package.json', '.eslintrc.json', 'node_modules/next', '.gitignore'],
  /**
   * Files specific to Next.js JS-only templates.
   */
  js: ['pages/index.js', 'pages/_app.js', 'pages/api/hello.js'],
  /**
   * Files specific to Next.js TypeScript-only templates.
   */
  ts: [
    'pages/index.tsx',
    'pages/_app.tsx',
    'pages/api/hello.ts',
    'tsconfig.json',
    'next-env.d.ts',
  ],
  app: [
    'app/page.tsx',
    'app/layout.tsx',
    'pages/api/hello.ts',
    'tsconfig.json',
    'next-env.d.ts',
  ],
}

export const projectDeps = {
  js: ['next', 'react', 'react-dom'],
  ts: ['next', 'react', 'react-dom'],
}

export const projectDevDeps = {
  js: ['eslint', 'eslint-config-next'],
  ts: [
    '@types/node',
    '@types/react',
    '@types/react-dom',
    'eslint',
    'eslint-config-next',
    'typescript',
  ],
}
