// Same relative path as the fixture next to next.config.ts. It must never be
// loaded: relative imports in next.config.ts resolve from the config's
// directory, not from process.cwd().
export const origin = 'cwd'
