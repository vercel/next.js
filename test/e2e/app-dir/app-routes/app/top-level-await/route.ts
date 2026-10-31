// This route uses a top-level await to simulate an async module (e.g. a route
// that fetches config or initializes a DB connection at module load time).
// require() returns a Promise for such modules, so the route module must not
// eagerly call _initFromUserland() before the Promise resolves.
const message = await Promise.resolve('hello from top-level await')

export async function GET() {
  return new Response(message)
}
