export default function Guide() {
  return (
    <>
      <section className="hero">
        <h1 data-testid="guide-title">Integration guide</h1>
        <p>
          A step-by-step walkthrough for taking the Acme SDK from an empty
          project to a production checkout, including the parts that usually
          go wrong: webhooks, idempotency, and going live.
        </p>
      </section>

      <section className="doc-section">
        <h2>1. Model your products</h2>
        <p>
          Before touching the SDK, decide what a purchasable unit is in your
          system and create it in the dashboard. Everything downstream —
          receipts, refunds, exports — keys off these product records, and
          renaming them later is an account-level migration.
        </p>
        <p>
          Keep prices out of your own database. The checkout always resolves
          the current price server-side at session creation, so a stale client
          can never charge an outdated amount.
        </p>
      </section>

      <section className="doc-section">
        <h2>2. Wire up the checkout</h2>
        <p>
          Render the checkout button anywhere below the provider. On click it
          creates a session, opens the payment sheet, and resolves with a
          result object your code can branch on. Optimistically updating your
          UI from that result is safe: the result is signed and verified
          against the session before the promise resolves.
        </p>
        <p>
          For carts, create the session ahead of the click and pass it in.
          Pre-created sessions keep the sheet opening instant even when your
          cart service is slow.
        </p>
      </section>

      <section className="doc-section">
        <h2>3. Handle webhooks</h2>
        <p>
          The webhook is the source of truth for fulfillment. Verify the
          signature, acknowledge within five seconds, and do the actual work
          on a queue. Every event carries an idempotency key; store it and
          drop duplicates, because retries are aggressive by design.
        </p>
        <p>
          The dashboard replays any event on demand, which is the fastest way
          to develop a handler: point a tunnel at localhost and replay the
          same event until your code is right.
        </p>
      </section>

      <section className="doc-section">
        <h2>4. Go live</h2>
        <p>
          Swap the publishable key, run one real transaction with a company
          card, and refund it from the dashboard. That single end-to-end pass
          catches nearly every launch-day surprise: CSP, webhook auth, and
          currency mismatches included.
        </p>
        <p>
          Keep the sandbox key wired into preview deployments. The SDK refuses
          live keys on non-production hostnames you have not allowlisted, so
          previews stay harmless by default.
        </p>
      </section>
    </>
  )
}
