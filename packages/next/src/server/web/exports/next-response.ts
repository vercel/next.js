// This file is for modularized imports for next/server to get fully-treeshaking.
// Export the default export and named export for the same module for typing resolving.
export {
  NextResponse,
  NextResponse as default,
} from '../spec-extension/response'
