import { DevToolsInfo } from './dev-tools-info'
import { noop as css } from '../../../../helpers/noop-template'

function StaticRouteContent() {
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
          href="https://nextjs.org/docs/app/building-your-application/data-fetching/incremental-static-regeneration"
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

function DynamicRouteContent() {
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
    </article>
  )
}

export function RouteInfo({
  routeType,
  isOpen,
  setIsOpen,
  setPreviousOpen,
  ...props
}: {
  routeType: 'Static' | 'Dynamic'
  isOpen: boolean
  setIsOpen: (isOpen: boolean) => void
  setPreviousOpen: (isOpen: boolean) => void
  style?: React.CSSProperties
  ref?: React.RefObject<HTMLElement | null>
}) {
  const isStaticRoute = routeType === 'Static'
  const learnMoreLink = isStaticRoute
    ? 'https://nextjs.org/docs/app/building-your-application/rendering/server-components#static-rendering-default'
    : 'https://nextjs.org/docs/app/building-your-application/rendering/server-components#dynamic-rendering'
  return (
    <DevToolsInfo
      {...props}
      title={`${routeType} Route`}
      learnMoreLink={learnMoreLink}
      setIsOpen={setIsOpen}
      setPreviousOpen={setPreviousOpen}
    >
      {isStaticRoute ? <StaticRouteContent /> : <DynamicRouteContent />}
    </DevToolsInfo>
  )
}

export const DEV_TOOLS_INFO_ROUTE_INFO_STYLES = css`
  .dev-tools-info-link {
  }
`
