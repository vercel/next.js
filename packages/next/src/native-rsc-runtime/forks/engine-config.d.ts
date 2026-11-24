// `#engine-config`: the engine's host config, in the sense of React's
// `ReactFiberConfig`. This is the type every engine fork
// (`engine-config.<engine>.ts`) must satisfy, and the only view of the forks
// renderer code has. Renderer code imports the alias, never a fork by path; the
// precompile resolves it to one fork per bundle type.

// Reports an error the render threw.
export function logError(error: unknown): void
