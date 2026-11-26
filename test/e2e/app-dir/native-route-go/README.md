# Native Go route verification

Deploy mode is not currently runnable for this fixture: the deployment harness has
no adapter that packages an `APP_ROUTE` with `runtime: 'go'` and provisions its
PORT-based server. The experiment has no built-in hosted Go
runtime. Deploying the fixture with the existing JS adapter cannot verify its HTTP
contract, and adding a successful skipped assertion would not test that contract.

The main suite verifies public HTTP behavior in dev and start modes. Its start-mode
adapter test copies each emitted executable and its assets into an isolated
function directory, starts it without Next.js or Go, and exercises methods,
streaming, rewritten destination URLs and dynamic parameters.
The executables target the build host. This is executable adapter-contract
coverage, not a claim of hosted deployment coverage.

`matched-path-cases.json` is shared by build validation and executable selection:
the accepted IDs must build through Rust and select their own Go handlers, while
ambiguous IDs must fail adapter builds. It includes `/index`, dynamic segments,
backslashes, percent escapes and UTF-8 header bytes.

The private-header case deliberately bypasses router-server's header filtering to
test the Go proxy's own filtering. Hosted ingress removes those headers before
Next.js sees them, so it cannot expose this inner boundary in isolation. The
ordinary HTTP case also checks that forged headers cannot change the routed
handler with all filtering enabled.

The `src/app` suite also moves local source directories and starts a local server.
The diagnostics suite mutates module boundaries and route directories, then runs
multiple local build commands against the same fixture. It verifies CLI
diagnostics in addition to the adapter HTTP contract above.

Once the deployment harness has a Go-capable adapter, enable a deploy smoke suite
for the public HTTP cases. Keep source mutation, process inspection, relocation and
failing-build checks local.
