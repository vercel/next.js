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

Adapters can set `NEXT_GO_ADAPTER_ROUTING` to
`{"version":1,"pathHeader":"x-matched-path"}` to supply a trusted concrete
escaped pathname after routing. The adapter must strip client values and supply
the header itself. This mode rejects missing, duplicate, or invalid context and
removes the header before user code runs. Parameter extraction uses the trusted
pathname while the handler retains the forwarded URL, raw query, and request URI,
including encoded catch-all segment boundaries. Without this configuration the
adapter executable matches the request URL directly.

The Vercel proof of concept host packager requires static Linux x86_64 binaries.
On another build host, crosscompiling the emitted Go entrypoint sources can check
that packaging contract; executing a host-native copy checks HTTP behavior.
Neither check substitutes for a deployment test of platform header filtering.

The `src/app` suite also moves local source directories and starts a local server.
The diagnostics suite intentionally invokes failing builds; these cannot be
deployed. Those checks are local by definition.

Once the deployment harness has a Go-capable adapter, enable a deploy smoke suite
for the public HTTP cases. Keep source mutation, process inspection, relocation and
failing-build checks local.
