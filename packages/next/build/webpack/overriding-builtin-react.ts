import { addRequireHook } from './require-hook'

addRequireHook([
  ['react', require.resolve('next/dist/compiled/react')],
  [
    'react/jsx-runtime',
    require.resolve('next/dist/compiled/react/jsx-runtime'),
  ],
  [
    'react/jsx-dev-runtime',
    require.resolve('next/dist/compiled/react/jsx-dev-runtime'),
  ],
  ['react-dom', require.resolve('next/dist/compiled/react-dom')],
  ['react-dom/server', require.resolve('next/dist/compiled/react-dom/server')],
  [
    'react-dom/server.browser',
    require.resolve('next/dist/compiled/react-dom/server.browser'),
  ],
])
