export class CompileError extends Error {}

/**
 * An actionable diagnostic produced while TypeScript reads project
 * configuration, before the compiler's main type-checking phase.
 */
export class TypeScriptDiagnosticError extends Error {}
