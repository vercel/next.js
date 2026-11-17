// next.config.ts rewrites this path to `/static` in `beforeFiles`. That user
// rule runs before the generated Markdown rewrite, so it wins.
export const markdown = '# Overridden page\n'

export default function Page() {
  return <h1>Overridden page</h1>
}
