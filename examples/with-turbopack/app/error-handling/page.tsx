import BuggyButton from '#/ui/buggy-button'
import { ExternalLink } from '#/ui/external-link'

export default function Page() {
  return (
    <div className="prose prose-sm prose-invert max-w-none">
      <h1 className="text-xl font-bold">Error Handling</h1>

      <ul>
        <li>
          <code>error.js</code> defines the error boundary for a route segment
          and the children below it. It can be used to show specific error
          information, and functionality to attempt to recover from the error.
        </li>
        <li>
          Trying navigation pages and triggering an error inside nested layouts.
          Notice how the error is isolated to that segment, while the rest of
          the app remains interactive.
        </li>
      </ul>

      <div className="flex gap-2">
        <BuggyButton />

        <ExternalLink href="https://beta.nextjs.org/docs/routing/error-handling">
          Docs
        </ExternalLink>
        <ExternalLink href="https://github.com/vercel/app-playground/tree/main/app/error-handling">
          Code
        </ExternalLink>
      </div>
    </div>
  )
}
