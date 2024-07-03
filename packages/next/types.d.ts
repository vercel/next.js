// Triple slash directives are copied from src/types.ts.
// TypeScript currently does not preserve the tripple-slash directives.
// Once https://github.com/microsoft/TypeScript/pull/57681 is released, we can remove the triple slash directives here.
/// <reference types="react" />
/// <reference types="react/experimental" />
/// <reference types="react-dom" />
/// <reference types="react-dom/experimental" />
/// <reference types="./types/compiled" />
export * from './dist/types'
export { default } from './dist/types'
