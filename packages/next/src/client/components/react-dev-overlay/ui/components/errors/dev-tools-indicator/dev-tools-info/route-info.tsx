import type { HTMLProps } from 'react'
import type { DevToolsInfoPropsCore } from './dev-tools-info'
import { DevToolsInfo } from './dev-tools-info'

function StaticRouteContent({ routerType }: { routerType: 'pages' | 'app' }) {
  return (
    <article className="dev-tools-info-article">
      <p className="dev-tools-info-paragraph">
        The path{' '}
        <code className="dev-tools-info-code">{window.location.pathname}</code>{' '}
        is marked as "static" since it will be prerendered during the build
        time.
      </p>
      <p className="dev-tools-info-paragraph">
        With Static Rendering, routes are rendered at build time, or in the
        background after{' '}
        <a
          className="dev-tools-info-link"
          href={
            routerType === 'pages'
              ? 'https://nextjs.org/docs/pages/building-your-application/data-fetching/incremental-static-regeneration'
              : `https://nextjs.org/docs/app/building-your-application/data-fetching/incremental-static-regeneration`
          }
          target="_blank"
          rel="noopener noreferrer"
        >
          data revalidation
        </a>
        .
      </p>
      <p className="dev-tools-info-paragraph">
        Static rendering is useful when a route has data that is not
        personalized to the user and can be known at build time, such as a
        static blog post or a product page.
      </p>
    </article>
  )
}

function DynamicRouteContent({ routerType }: { routerType: 'pages' | 'app' }) {
  return (
    <article className="dev-tools-info-article">
      <p className="dev-tools-info-paragraph">
        The path{' '}
        <code className="dev-tools-info-code">{window.location.pathname}</code>{' '}
        is marked as "dynamic" since it will be rendered for each user at{' '}
        <strong>request time</strong>.
      </p>
      <p className="dev-tools-info-paragraph">
        Dynamic rendering is useful when a route has data that is personalized
        to the user or has information that can only be known at request time,
        such as cookies or the URL's search params.
      </p>
      {routerType === 'pages' ? (
        <p className="dev-tools-info-pagraph">
          Exporting the{' '}
          <a
            className="dev-tools-info-link"
            href="https://nextjs.org/docs/pages/building-your-application/data-fetching/get-server-side-props"
            target="_blank"
            rel="noopener noreferrer"
          >
            getServerSideProps
          </a>{' '}
          function will opt the route into dynamic rendering. This function will
          be called by the server on every request.
        </p>
      ) : (
        <p className="dev-tools-info-paragraph">
          During rendering, if a{' '}
          <a
            className="dev-tools-info-link"
            href="https://nextjs.org/docs/app/building-your-application/rendering/server-components#dynamic-apis"
            target="_blank"
            rel="noopener noreferrer"
          >
            Dynamic API
          </a>{' '}
          or a{' '}
          <a
            className="dev-tools-info-link"
            href="https://nextjs.org/docs/app/api-reference/functions/fetch"
            target="_blank"
            rel="noopener noreferrer"
          >
            fetch
          </a>{' '}
          option of{' '}
          <code className="dev-tools-info-code">{`{ cache: 'no-store' }`}</code>{' '}
          is discovered, Next.js will switch to dynamically rendering the whole
          route.
        </p>
      )}
    </article>
  )
}

const learnMoreLink = {
  pages: {
    static:
      'https://nextjs.org/docs/pages/building-your-application/rendering/static-site-generation',
    dynamic:
      'https://nextjs.org/docs/pages/building-your-application/rendering/server-side-rendering',
  },
  app: {
    static:
      'https://nextjs.org/docs/app/building-your-application/rendering/server-components#static-rendering-default',
    dynamic:
      'https://nextjs.org/docs/app/building-your-application/rendering/server-components#dynamic-rendering',
  },
} as const

export function RouteInfo({
  routeType,
  routerType,
  ...props
}: {
  routeType: 'Static' | 'Dynamic'
  routerType: 'pages' | 'app'
} & DevToolsInfoPropsCore &
  HTMLProps<HTMLDivElement>) {
  const isStaticRoute = routeType === 'Static'

  const learnMore = isStaticRoute
    ? learnMoreLink[routerType].static
    : learnMoreLink[routerType].dynamic

  return (
    <DevToolsInfo
      title={`${routeType} Route`}
      learnMoreLink={learnMore}
      {...props}
    >
      {isStaticRoute ? (
        <StaticRouteContent routerType={routerType} />
      ) : (
        <DynamicRouteContent routerType={routerType} />
      )}
    </DevToolsInfo>
  )
}

export const DEV_TOOLS_INFO_ROUTE_INFO_STYLES = ``
