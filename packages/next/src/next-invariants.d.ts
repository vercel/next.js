// Internal type declaration for __NEXT_INVARIANTS__. This is NOT published to
// users — it's only included in the framework's tsconfig.build.json so that
// framework source code can access the typed global.
declare global {
  var __NEXT_INVARIANTS__: import('./server/next-invariants').NextInvariants
}

export {}
