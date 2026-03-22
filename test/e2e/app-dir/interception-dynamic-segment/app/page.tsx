import { LinkAccordion } from './page.client'

export default function Page() {
  return (
    <div id="children">
      <section>
        <h2>✅ Should Work WITHOUT default.tsx</h2>

        <div>
          <h3>Test Case 1a: Simple page (no parallel routes)</h3>
          <LinkAccordion href="/simple-page" />
          <p>
            Interception route with just a page.tsx, no parallel routes at all.
          </p>
        </div>

        <div>
          <h3>Test Case 1b: Has page.tsx</h3>
          <LinkAccordion href="/has-page" />
          <p>
            Interception route has page.tsx at root level. No children slot
            exists.
          </p>
        </div>

        <div>
          <h3>Test Case 2: No parallel routes</h3>
          <LinkAccordion href="/no-parallel-routes/deeper" />
          <p>No @parallel routes exist, so no implicit layout created.</p>
        </div>

        <div>
          <h3>Test Case 3: Has both @sidebar AND page.tsx</h3>
          <LinkAccordion href="/has-both" />
          <p>
            Has @sidebar parallel route BUT page.tsx fills the children slot.
          </p>
        </div>
      </section>

      <section>
        <h2>🔬 Test Cases - Require Null Default Logic</h2>

        <div>
          <h3>Test Case 4a: Has @sidebar but NO page.tsx (implicit layout)</h3>
          <LinkAccordion href="/test-nested" />
          <p>Has @sidebar (creates implicit layout) but NO page.tsx.</p>
          <p>✓ Auto-uses null default (no explicit files needed)</p>
        </div>

        <div>
          <h3>Test Case 4b: Has explicit layout.tsx but NO parallel routes</h3>
          <LinkAccordion href="/explicit-layout/deeper" />
          <p>
            Has explicit layout.tsx with children slot, but NO parallel routes
            like @sidebar.
          </p>
          <p>
            ? Should it 404 or 200? This determines if we need to check for
            explicit layouts!
          </p>
        </div>
      </section>
      <section>
        <h2>Original Tests</h2>
        <ul>
          <li>
            <LinkAccordion href="/foo/1" />
          </li>
          <li>
            <LinkAccordion href="/bar/1" />
          </li>
          <li>
            <LinkAccordion href="/test-nested/deeper" />
          </li>
          <li>
            <LinkAccordion href="/generate-static-params/foo" />
          </li>
        </ul>
      </section>
    </div>
  )
}
