import { ExternalLink } from '#/ui/external-link'

export default function Page() {
  return (
    <div className="prose prose-sm prose-invert max-w-none">
      <h1 className="text-xl font-bold">Instant Loading States</h1>

      <ul>
        <li>
          This example has an artificial delay when &quot;fetching&quot; data
          for each category page. <code>loading.js</code> is used to show a
          loading skeleton immediately while data for category page loads before
          being streamed in.
        </li>
        <li>
          Shared layouts remain interactive while nested layouts or pages load.
          Try clicking the counter while the children load.
        </li>
        <li>
          Navigation is interruptible. Try navigating to one category, then
          clicking a second category before the first one has loaded.
        </li>
      </ul>

      <div className="flex gap-2">
        <ExternalLink href="https://beta.nextjs.org/docs/routing/loading-ui">
          Docs
        </ExternalLink>
        <ExternalLink href="https://github.com/vercel/app-playground/tree/main/app/loading">
          Code
        </ExternalLink>
      </div>
    </div>
  )
}
