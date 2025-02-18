import { DevToolsInfo } from './dev-tools-info'
import { noop as css } from '../../../../helpers/noop-template'

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
  return (
    <DevToolsInfo
      title={`${routeType} Route`}
      learnMoreLink="https://nextjs.org/docs/app/building-your-application/rendering/server-components#static-rendering-default"
      setIsOpen={setIsOpen}
      setPreviousOpen={setPreviousOpen}
      {...props}
    >
      <article className="dev-tools-info-article">
        <p className="dev-tools-info-paragraph">
          The path{' '}
          <code className="dev-tools-info-code">
            {window.location.pathname}
          </code>{' '}
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
    </DevToolsInfo>
  )
}

export const DEV_TOOLS_INFO_ROUTE_INFO_STYLES = css`
  .dev-tools-info-link {
  }
`
