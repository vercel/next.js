export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    // A Client Component cannot import `node:v8`. The one that this app renders
    // on the server gets the check through a global.
    const young = globalThis as { youngGeneration?: object }
    young.youngGeneration = await import('./lib/in-young-generation')
  }
}
