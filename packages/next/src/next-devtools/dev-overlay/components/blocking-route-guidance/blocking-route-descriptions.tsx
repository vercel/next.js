export function DynamicMetadataErrorDescription({
  variant,
}: {
  variant: 'navigation' | 'runtime'
}) {
  if (variant === 'navigation') {
    return (
      <div className="nextjs__blocking_page_load_error_description">
        <h3 className="nextjs__blocking_page_load_error_description_title">
          Data that blocks navigation was accessed inside{' '}
          <code>generateMetadata()</code> in an otherwise prerenderable page
        </h3>
        <p>
          When Document metadata is the only part of a page that cannot be
          prerendered Next.js expects you to either make it prerenderable or
          make some other part of the page non-prerenderable to avoid
          unintentional partially dynamic pages. Uncached data such as{' '}
          <code>fetch(...)</code>, cached data with a low expire time, or{' '}
          <code>connection()</code> are all examples of data that only resolve
          on navigation.
        </p>
        <h4>To fix this:</h4>
        <p className="nextjs__blocking_page_load_error_fix_option">
          <strong>
            Move the asynchronous await into a Cache Component (
            <code>"use cache"</code>)
          </strong>
          . This allows Next.js to statically prerender{' '}
          <code>generateMetadata()</code> as part of the HTML document, so it's
          instantly visible to the user.
        </p>
        <h4 className="nextjs__blocking_page_load_error_fix_option_separator">
          or
        </h4>
        <p className="nextjs__blocking_page_load_error_fix_option">
          <strong>
            add <code>connection()</code> inside a <code>{'<Suspense>'}</code>
          </strong>{' '}
          somewhere in a Page or Layout. This tells Next.js that the page is
          intended to have some non-prerenderable parts.
        </p>
        <p>
          Learn more:{' '}
          <a href="https://nextjs.org/docs/messages/next-prerender-dynamic-metadata">
            https://nextjs.org/docs/messages/next-prerender-dynamic-metadata
          </a>
        </p>
      </div>
    )
  } else {
    return (
      <div className="nextjs__blocking_page_load_error_description">
        <h3 className="nextjs__blocking_page_load_error_description_title">
          Runtime data was accessed inside <code>generateMetadata()</code> or
          file-based metadata
        </h3>
        <p>
          When Document metadata is the only part of a page that cannot be
          prerendered Next.js expects you to either make it prerenderable or
          make some other part of the page non-prerenderable to avoid
          unintentional partially dynamic pages.
        </p>
        <h4>To fix this:</h4>
        <p className="nextjs__blocking_page_load_error_fix_option">
          <strong>
            Remove the Runtime data access from <code>generateMetadata()</code>
          </strong>
          . This allows Next.js to statically prerender{' '}
          <code>generateMetadata()</code> as part of the HTML document, so it's
          instantly visible to the user.
        </p>
        <h4 className="nextjs__blocking_page_load_error_fix_option_separator">
          or
        </h4>
        <p className="nextjs__blocking_page_load_error_fix_option">
          <strong>
            add <code>connection()</code> inside a <code>{'<Suspense>'}</code>
          </strong>{' '}
          somewhere in a Page or Layout. This tells Next.js that the page is
          intended to have some non-prerenderable parts.
        </p>
        <p>
          Note that if you are using file-based metadata, such as icons, inside
          a route with dynamic params then the only recourse is to make some
          other part of the page non-prerenderable.
        </p>
        <p>
          Learn more:{' '}
          <a href="https://nextjs.org/docs/messages/next-prerender-dynamic-metadata">
            https://nextjs.org/docs/messages/next-prerender-dynamic-metadata
          </a>
        </p>
      </div>
    )
  }
}

export function BlockingPageLoadErrorDescription({
  variant,
  refinement,
}: {
  variant: 'navigation' | 'runtime'
  refinement: '' | 'generateViewport' | 'generateMetadata'
}) {
  if (refinement === 'generateViewport') {
    if (variant === 'navigation') {
      return (
        <div className="nextjs__blocking_page_load_error_description">
          <h3 className="nextjs__blocking_page_load_error_description_title">
            Data that blocks navigation was accessed inside{' '}
            <code>generateViewport()</code>
          </h3>
          <p>
            Viewport metadata needs to be available on page load so accessing
            data that waits for a user navigation while producing it prevents
            Next.js from prerendering an initial UI. Uncached data such as{' '}
            <code>fetch(...)</code>, cached data with a low expire time, or{' '}
            <code>connection()</code> are all examples of data that only resolve
            on navigation.
          </p>
          <h4>To fix this:</h4>
          <p className="nextjs__blocking_page_load_error_fix_option">
            <strong>
              Move the asynchronous await into a Cache Component (
              <code>"use cache"</code>)
            </strong>
            . This allows Next.js to statically prerender{' '}
            <code>generateViewport()</code> as part of the HTML document, so
            it's instantly visible to the user.
          </p>
          <h4 className="nextjs__blocking_page_load_error_fix_option_separator">
            or
          </h4>
          <p className="nextjs__blocking_page_load_error_fix_option">
            <strong>
              Put a <code>{'<Suspense>'}</code> around your document{' '}
              <code>{'<body>'}</code>.
            </strong>
            This indicate to Next.js that you are opting into allowing blocking
            navigations for any page.
          </p>
          <p>
            Learn more:{' '}
            <a href="https://nextjs.org/docs/messages/next-prerender-dynamic-viewport">
              https://nextjs.org/docs/messages/next-prerender-dynamic-viewport
            </a>
          </p>
        </div>
      )
    } else {
      return (
        <div className="nextjs__blocking_page_load_error_description">
          <h3 className="nextjs__blocking_page_load_error_description_title">
            Runtime data was accessed inside <code>generateViewport()</code>
          </h3>
          <p>
            Viewport metadata needs to be available on page load so accessing
            data that comes from a user Request while producing it prevents
            Next.js from prerendering an initial UI.
            <code>cookies()</code>, <code>headers()</code>, <code>params</code>,
            and <code>searchParams</code> are examples of Runtime data that can
            only come from a user request.
          </p>
          <h4>To fix this:</h4>
          <p className="nextjs__blocking_page_load_error_fix_option">
            <strong>Remove the Runtime data requirement</strong> from{' '}
            <code>generateViewport</code>. This allows Next.js to statically
            prerender <code>generateViewport()</code> as part of the HTML
            document, so it's instantly visible to the user.
          </p>
          <h4 className="nextjs__blocking_page_load_error_fix_option_separator">
            or
          </h4>
          <p className="nextjs__blocking_page_load_error_fix_option">
            <strong>
              Put a <code>{'<Suspense>'}</code> around your document{' '}
              <code>{'<body>'}</code>.
            </strong>
            This indicate to Next.js that you are opting into allowing blocking
            navigations for any page.
          </p>
          <p>
            <code>params</code> are usually considered Runtime data but if all
            params are provided a value using <code>generateStaticParams</code>{' '}
            they can be statically prerendered.
          </p>
          <p>
            Learn more:{' '}
            <a href="https://nextjs.org/docs/messages/next-prerender-dynamic-viewport">
              https://nextjs.org/docs/messages/next-prerender-dynamic-viewport
            </a>
          </p>
        </div>
      )
    }
  } else if (refinement === 'generateMetadata') {
    if (variant === 'navigation') {
      return (
        <div className="nextjs__blocking_page_load_error_description">
          <h3 className="nextjs__blocking_page_load_error_description_title">
            Data that blocks navigation was accessed inside{' '}
            <code>generateMetadata()</code> in an otherwise prerenderable page
          </h3>
          <p>
            When Document metadata is the only part of a page that cannot be
            prerendered Next.js expects you to either make it prerenderable or
            make some other part of the page non-prerenderable to avoid
            unintentional partially dynamic pages. Uncached data such as{' '}
            <code>fetch(...)</code>, cached data with a low expire time, or{' '}
            <code>connection()</code> are all examples of data that only resolve
            on navigation.
          </p>
          <h4>To fix this:</h4>
          <p className="nextjs__blocking_page_load_error_fix_option">
            <strong>
              Move the asynchronous await into a Cache Component (
              <code>"use cache"</code>)
            </strong>
            . This allows Next.js to statically prerender{' '}
            <code>generateMetadata()</code> as part of the HTML document, so
            it's instantly visible to the user.
          </p>
          <h4 className="nextjs__blocking_page_load_error_fix_option_separator">
            or
          </h4>
          <p className="nextjs__blocking_page_load_error_fix_option">
            <strong>
              add <code>connection()</code> inside a <code>{'<Suspense>'}</code>
            </strong>{' '}
            somewhere in a Page or Layout. This tells Next.js that the page is
            intended to have some non-prerenderable parts.
          </p>
          <p>
            Learn more:{' '}
            <a href="https://nextjs.org/docs/messages/next-prerender-dynamic-metadata">
              https://nextjs.org/docs/messages/next-prerender-dynamic-metadata
            </a>
          </p>
        </div>
      )
    } else {
      return (
        <div className="nextjs__blocking_page_load_error_description">
          <h3 className="nextjs__blocking_page_load_error_description_title">
            Runtime data was accessed inside <code>generateMetadata()</code> or
            file-based metadata
          </h3>
          <p>
            When Document metadata is the only part of a page that cannot be
            prerendered Next.js expects you to either make it prerenderable or
            make some other part of the page non-prerenderable to avoid
            unintentional partially dynamic pages.
          </p>
          <h4>To fix this:</h4>
          <p className="nextjs__blocking_page_load_error_fix_option">
            <strong>
              Remove the Runtime data access from{' '}
              <code>generateMetadata()</code>
            </strong>
            . This allows Next.js to statically prerender{' '}
            <code>generateMetadata()</code> as part of the HTML document, so
            it's instantly visible to the user.
          </p>
          <h4 className="nextjs__blocking_page_load_error_fix_option_separator">
            or
          </h4>
          <p className="nextjs__blocking_page_load_error_fix_option">
            <strong>
              add <code>connection()</code> inside a <code>{'<Suspense>'}</code>
            </strong>{' '}
            somewhere in a Page or Layout. This tells Next.js that the page is
            intended to have some non-prerenderable parts.
          </p>
          <p>
            Note that if you are using file-based metadata, such as icons,
            inside a route with dynamic params then the only recourse is to make
            some other part of the page non-prerenderable.
          </p>
          <p>
            Learn more:{' '}
            <a href="https://nextjs.org/docs/messages/next-prerender-dynamic-metadata">
              https://nextjs.org/docs/messages/next-prerender-dynamic-metadata
            </a>
          </p>
        </div>
      )
    }
  }

  if (variant === 'runtime') {
    return (
      <div className="nextjs__blocking_page_load_error_description">
        <h3 className="nextjs__blocking_page_load_error_description_title">
          A request-time API was used outside of {'<Suspense>'}
        </h3>
        <p>
          The call stack above shows where the API was accessed. This prevents
          Next.js from prerendering the page, delaying every navigation.
        </p>
        <h4>To fix this:</h4>
        <p className="nextjs__blocking_page_load_error_fix_option">
          <strong>Wrap that part of the tree in {'<Suspense>'}</strong> so
          Next.js can stream its contents while showing a prerendered fallback.
        </p>
        <h4 className="nextjs__blocking_page_load_error_fix_option_separator">
          or
        </h4>
        <p className="nextjs__blocking_page_load_error_fix_option">
          <strong>
            Move the API call into a deeper component wrapped in {'<Suspense>'}.
          </strong>
        </p>
        <p>
          Learn more:{' '}
          <a href="https://nextjs.org/docs/messages/blocking-route">
            https://nextjs.org/docs/messages/blocking-route
          </a>
        </p>
      </div>
    )
  } else {
    return (
      <div className="nextjs__blocking_page_load_error_description">
        <h3 className="nextjs__blocking_page_load_error_description_title">
          Uncached data was accessed outside of {'<Suspense>'}
        </h3>
        <p>
          The call stack above shows where the data was accessed. This prevents
          Next.js from prerendering the page, delaying every navigation.
        </p>
        <h4>To fix this:</h4>
        <p className="nextjs__blocking_page_load_error_fix_option">
          <strong>Wrap that part of the tree in {'<Suspense>'}</strong> so
          Next.js can stream its contents while showing a prerendered fallback.
        </p>
        <h4 className="nextjs__blocking_page_load_error_fix_option_separator">
          or
        </h4>
        <p className="nextjs__blocking_page_load_error_fix_option">
          <strong>
            Cache the data with <code>"use cache"</code>
          </strong>{' '}
          so Next.js can statically prerender the component.
        </p>
        <p>
          Learn more:{' '}
          <a href="https://nextjs.org/docs/messages/blocking-route">
            https://nextjs.org/docs/messages/blocking-route
          </a>
        </p>
      </div>
    )
  }
}
