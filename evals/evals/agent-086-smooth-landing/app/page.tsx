export default function Home() {
  return (
    <>
      <section className="hero">
        <h1 data-testid="home-title">Acme SDK documentation</h1>
        <p>
          Everything you need to embed the Acme payments SDK in your product:
          a quickstart, configuration reference, the full client API, and a
          troubleshooting playbook collected from support escalations.
        </p>
        <div className="toc">
          <strong>On this page</strong>
          <ul>
            <li>
              <a href="#quickstart" data-testid="toc-link-quickstart">
                Quickstart
              </a>
            </li>
            <li>
              <a href="#configuration" data-testid="toc-link-configuration">
                Configuration
              </a>
            </li>
            <li>
              <a href="#api" data-testid="toc-link-api">
                Client API
              </a>
            </li>
            <li>
              <a href="#troubleshooting" data-testid="toc-link-troubleshooting">
                Troubleshooting
              </a>
            </li>
          </ul>
        </div>
      </section>

      <section id="quickstart" className="doc-section">
        <h2>Quickstart</h2>
        <p>
          Install the package, drop the provider at the root of your tree, and
          render your first checkout button. The SDK lazily loads the payment
          iframe, so nothing here affects your initial bundle.
        </p>
        <p>
          Once the provider mounts it opens a session against your publishable
          key. Sessions are scoped per browser tab and renew automatically; you
          never need to store or refresh them yourself. If the key is missing
          the provider renders its children unchanged and logs a warning, so a
          misconfigured staging deploy fails soft instead of blanking the page.
        </p>
        <p>
          The quickstart app in the examples repository shows the whole flow
          end to end: provider, button, webhook handler, and a fake bank you
          can use to rehearse declined-card and 3DS paths before going live.
        </p>
      </section>

      <section id="configuration" className="doc-section">
        <h2>Configuration</h2>
        <p>
          All configuration flows through the provider. Options are validated
          at mount and unknown keys throw in development so typos surface
          immediately rather than as silently ignored settings in production.
        </p>
        <p>
          Locale, currency display, and retry policy can be overridden per
          checkout. Anything not overridden inherits from the provider, and
          anything the provider does not set inherits from your account-level
          defaults in the dashboard, in that order.
        </p>
        <p>
          For multi-tenant products, pass a tenant resolver instead of a fixed
          account id. The resolver runs once per session, its result is cached
          in memory, and the cache is dropped whenever the tab regains focus
          after more than thirty minutes idle.
        </p>
      </section>

      <section id="api" className="doc-section">
        <h2>Client API</h2>
        <p>
          The client exposes a small imperative surface for the rare cases the
          components do not cover: creating checkouts programmatically,
          querying session state, and subscribing to lifecycle events.
        </p>
        <p>
          Every method returns a promise and rejects with a typed error. Error
          codes are stable and documented; matching on the message string is
          unsupported and will break between minor releases. Event
          subscriptions return an unsubscribe function and are safe to call
          from effects.
        </p>
        <p>
          Instances are cheap: creating one per render is fine, because the
          heavy state lives in a module-level session shared by all instances
          in the tab. Tree-shaking removes any methods you never call.
        </p>
      </section>

      <section id="troubleshooting" className="doc-section">
        <h2>Troubleshooting</h2>
        <p>
          The most common integration issue is a Content-Security-Policy that
          blocks the payment iframe. The SDK detects this and surfaces a
          console error naming the exact directive to add. Second most common
          is running the sandbox key in production, which the dashboard flags
          on the first live request.
        </p>
        <p>
          If checkouts hang at the spinner, check that your webhook endpoint
          responds within five seconds. Slow webhook acknowledgements delay
          the confirmation event the client is waiting on, and the spinner is
          almost never a client-side problem.
        </p>
        <p>
          For anything else, the debug panel prints a correlation id with each
          request. Include it in support tickets and we can trace the request
          across every internal hop.
        </p>
      </section>
    </>
  )
}
