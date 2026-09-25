const ts = require('typescript')

// Jest runs the TypeScript action source without emitting temporary JS into
// the repository checkout (where repo-wide lint would discover it).
module.exports = {
  process(source, filename) {
    return {
      code: ts.transpileModule(source, {
        fileName: filename,
        compilerOptions: {
          module: ts.ModuleKind.CommonJS,
          target: ts.ScriptTarget.ES2024,
          esModuleInterop: true,
        },
      }).outputText,
    }
  },
}
