import { ExternalLink } from '#/ui/external-link'

export default async function Page() {
  return (
    <div className="prose prose-sm prose-invert max-w-none">
      <h1 className="text-xl font-bold">Streaming with Suspense</h1>

      <ul>
        <li>
          Streaming allows you to progressively render and send units of the UI
          from the server to the client.
        </li>

        <li>
          This allows the user to see and interact with the most essential parts
          of the page while the rest of the content loads - instead of waiting
          for the whole page to load before they can interact with anything.
        </li>

        <li>Streaming works with both Edge and Node runtimes.</li>

        <li>
          Try streaming by <strong>selecting a runtime</strong> in the
          navigation above.
        </li>
      </ul>

      <div className="flex gap-2">
        <ExternalLink href="https://beta.nextjs.org/docs/data-fetching/streaming-and-suspense">
          Docs
        </ExternalLink>
        <ExternalLink href="https://github.com/vercel/app-playground/tree/main/app/streaming">
          Code
        </ExternalLink>
      </div>
    </div>
  )
}
