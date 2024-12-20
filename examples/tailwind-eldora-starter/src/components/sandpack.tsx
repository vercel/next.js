'use client';

import { Sandpack } from '@codesandbox/sandpack-react';
import {
  HTML,
  CSS,
  Tailwind,
  stylexIndex,
  stylexApp,
  stylexViteConfig,
  stylexTokens,
} from './sandpackfiles';
import React, { Suspense } from 'react';

class ErrorBoundary extends React.Component<
  { fallback: React.ReactNode; children?: React.ReactNode },
  { hasError: boolean }
> {
  constructor(props: { fallback: React.ReactNode; children: React.ReactNode }) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(error: any) {
    return { hasError: true };
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="px-4 py-3 border border-red-700 bg-red-200 rounded p-1 text-sm flex items-center text-red-900 mb-8">
          <div className="w-full callout">{this.props.fallback}</div>
        </div>
      );
    }

    return this.props.children;
  }
}

export function LiveCode({ example }: { example: string }) {
  let files;

  if (example === 'html') {
    files = {
      '/styles.css': {
        code: CSS,
        active: true,
      },
      '/index.html': HTML,
    };
  } else if (example === 'tailwind') {
    files = {
      '/index.html': Tailwind,
    };
  } else if (example === 'stylex') {
    return (
      <Suspense fallback={null}>
        <ErrorBoundary
          fallback={'Oops, there was an error loading the CodeSandbox'}
        >
          <Sandpack
            theme="auto"
            files={{
              'App.tsx': {
                code: stylexApp,
                active: true,
              },
              '/tokens.stylex.js': stylexTokens,
              '/vite.config.ts': stylexViteConfig,
              '/index.html': {
                code: stylexIndex,
                hidden: true,
              },
            }}
            template="vite-react-ts"
            customSetup={{
              dependencies: {
                '@stylexjs/stylex': '^0.3.0',
              },
              devDependencies: {
                'vite-plugin-stylex-dev': 'latest',
              },
            }}
          />
        </ErrorBoundary>
      </Suspense>
    );
  }

  return (
    <Suspense fallback={null}>
      <ErrorBoundary
        fallback={'Oops, there was an error loading the CodeSandbox.'}
      >
        <Sandpack theme="auto" template="static" files={files} />
      </ErrorBoundary>
    </Suspense>
  );
}