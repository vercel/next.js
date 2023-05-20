import { ExternalLink } from '#/ui/external-link'

export default function Page() {
  return (
    <div className="prose prose-sm prose-invert max-w-none">
      <h1 className="text-xl font-bold">Route Groups</h1>

      <ul>
        <li>
          This example uses Route Groups to create layouts for different
          sections of the app without affecting the URL structure.
        </li>
        <li>
          Try navigating pages and noting the different layouts used for each
          section.
        </li>
        <li>Route groups can be used to:</li>
        <ul>
          <li>Opt a route segment out of a shared layout.</li>
          <li>Organize routes without affecting the URL structure.</li>
          <li>
            Create multiple root layouts by partitioning the top level of the
            application.
          </li>
        </ul>
      </ul>

      <div className="flex gap-2">
        <ExternalLink href="https://beta.nextjs.org/docs/routing/defining-routes#route-groups">
          Docs
        </ExternalLink>
        <ExternalLink href="https://github.com/vercel/app-playground/tree/main/app/route-groups">
          Code
        </ExternalLink>
      </div>
    </div>
  )
}
