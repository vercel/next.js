// Route handlers run in the dev server child process, so this returns the pid
// of the process that `next dev` forks to serve requests.
export function GET() {
  return new Response(String(process.pid))
}
