import { ExternalLink } from '#/ui/external-link'

export default function Page() {
  return (
    <div className="prose prose-sm prose-invert max-w-none">
      <h1 className="text-xl font-bold">Static Data</h1>

      <ul>
        <li>By default, data fetching in Next.js is cached static.</li>
        <li>This example statically caches data fetches for Post 1 and 2.</li>
        <li>
          A random third post is fetched on-demand the first time it is
          requested.
        </li>
        <li>
          Try navigating to each post and noting the timestamp of when the page
          was rendered.
        </li>
      </ul>

      <div className="flex gap-2">
        <ExternalLink href="https://beta.nextjs.org/docs/data-fetching/fetching#static-data">
          Docs
        </ExternalLink>
        <ExternalLink href="https://github.com/vercel/app-playground/tree/main/app/ssg">
          Code
        </ExternalLink>
      </div>
    </div>
  )
}
