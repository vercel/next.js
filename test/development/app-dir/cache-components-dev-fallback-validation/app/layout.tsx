export default function Root({ children }: { children: React.ReactNode }) {
  return (
    <html>
      <body>
        {children}
        <main>
          <h1>Validating Fallback Shells in Dev</h1>
          <p>
            This App is made up of a number of sub-pages which exercise the
            Cache Components validation performed in dev to ensure it matches up
            with the validation performed during the build.
          </p>
          <p>
            When Building routes with dynamic params we validate that the
            prerender produces an acceptable static shell. If we do not have a
            complete set of params for any given page we will use a special kind
            of param called a fallback param which suspends as dynamic and is
            required to be wrapped in Suspense if accessed so we can ensure
            there is still an acceptable shell even when we don't know about
            specific values for that param.
          </p>
          <p>
            In Dev, our validation needs to match and the way we do this is we
            look at the current route and determine the most specific set of
            params that would be availalbe during the build and then use the
            remaining fallback params for the validation render. This way if you
            see an error during the build you should be able to debug that error
            during development too.
          </p>
          <p>
            Click on some of the sample links for the routes
            '.../[top]/.../[bottom]'
          </p>
          <section>
            <h2>Complete Params</h2>
            <p>
              These links are for routes where the build has a complete set of
              params to prerender with. We don't expect these to fail at all
              during validation because nothing is dynamic on these pages other
              than possible param access
            </p>
            <h3>Suspense between [top] and [bottom]</h3>
            <ul>
              <li>
                <a href="/complete/prerendered/wrapped/prerendered">
                  /complete/prerendered/wrapped/prerendered
                </a>
              </li>
              <li>
                <a href="/complete/prerendered/wrapped/novel">
                  /complete/prerendered/wrapped/novel
                </a>
              </li>
              <li>
                <a href="/complete/novel/wrapped/novel">
                  /complete/novel/wrapped/novel
                </a>
              </li>
            </ul>
            <h3>No Suspense</h3>
            <ul>
              <li>
                <a href="/complete/prerendered/unwrapped/prerendered">
                  /complete/prerendered/unwrapped/prerendered
                </a>
              </li>
              <li>
                <a href="/complete/prerendered/unwrapped/novel">
                  /complete/prerendered/unwrapped/novel
                </a>
              </li>
              <li>
                <a href="/complete/novel/unwrapped/novel">
                  /complete/novel/unwrapped/novel
                </a>
              </li>
            </ul>
          </section>
          <section>
            <h2>Partial Params</h2>
            <p>
              These links are for routes where the top param is prerendered
              during the build but the bottom param is not. We expect that if
              you attempt to access the bottom param without a wrapping Suspense
              boundary it will fail validation
            </p>
            <h3>Suspense between [top] and [bottom]</h3>
            <ul>
              <li>
                <a href="/partial/prerendered/wrapped/prerendered">
                  /partial/prerendered/wrapped/prerendered
                </a>
              </li>
              <li>
                <a href="/partial/prerendered/wrapped/novel">
                  /partial/prerendered/wrapped/novel
                </a>
              </li>
              <li>
                <a href="/partial/novel/wrapped/novel">
                  /partial/novel/wrapped/novel
                </a>
              </li>
            </ul>
            <h3>No Suspense</h3>
            <ul>
              <li>
                <a href="/partial/prerendered/unwrapped/prerendered">
                  /partial/prerendered/unwrapped/prerendered
                </a>
              </li>
              <li>
                <a href="/partial/prerendered/unwrapped/novel">
                  /partial/prerendered/unwrapped/novel
                </a>
              </li>
              <li>
                <a href="/partial/novel/unwrapped/novel">
                  /partial/novel/unwrapped/novel
                </a>
              </li>
            </ul>
          </section>
          <section>
            <h2>No Params</h2>
            <p>
              These links are for routes where there are no params provided
              during the build at all. We expect these to fail validation if you
              attempt to access the params above a Suspense boundary.
            </p>
            <h3>Suspense between [top] and [bottom]</h3>
            <ul>
              <li>
                <a href="/none/prerendered/wrapped/prerendered">
                  /none/prerendered/wrapped/prerendered
                </a>
              </li>
              <li>
                <a href="/none/prerendered/wrapped/novel">
                  /none/prerendered/wrapped/novel
                </a>
              </li>
              <li>
                <a href="/none/novel/wrapped/novel">
                  /none/novel/wrapped/novel
                </a>
              </li>
            </ul>
            <h3>No Suspense</h3>
            <ul>
              <li>
                <a href="/none/prerendered/unwrapped/prerendered">
                  /none/prerendered/unwrapped/prerendered
                </a>
              </li>
              <li>
                <a href="/none/prerendered/unwrapped/novel">
                  /none/prerendered/unwrapped/novel
                </a>
              </li>
              <li>
                <a href="/none/novel/unwrapped/novel">
                  /none/novel/unwrapped/novel
                </a>
              </li>
            </ul>
          </section>
        </main>
      </body>
    </html>
  )
}
