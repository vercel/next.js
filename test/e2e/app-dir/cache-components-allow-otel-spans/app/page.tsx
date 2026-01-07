export default function Page() {
  return (
    <main>
      <h1>OTel Cache Components Compat Test</h1>
      <p>
        Span generation causes random IDs to be created. There is a tradeoff
        with this while prerendering since sync IO like Math.random() should be
        excluded from static prerenders but spans are so widely used for
        providing telemetry for rendering and they would ideally be side effect
        free. Next.js now allows random id generation and current time reading
        while OTel spans are constructed. However it is possible for the span
        object to be passed to a Cache Component where the random ID will cause
        cache misses while prerendering. It is important that Span objects not
        be passed into Cache Functions for proper functioning of Cache
        Components.
      </p>
      <ul>
        <li>
          <a href="/novel/cache">
            "use cache" Page without build-time prerendering
          </a>
        </li>
        <li>
          <a href="/prerendered/cache">
            "use cache" Page with build-time prerendering
          </a>
        </li>
        <li>
          <a href="/novel/server">
            Server Page without build-time prerendering
          </a>
        </li>
        <li>
          <a href="/prerendered/server">
            Server Page with build-time prerendering
          </a>
        </li>
      </ul>
    </main>
  )
}
