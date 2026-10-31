# Native Go route verification

Deploy mode is not currently runnable for this fixture: the deployment harness has
no adapter that packages an `APP_ROUTE` with `runtime: 'go'`, selects its Go target,
and provisions its PORT-based server. The experiment has no built-in hosted Go
runtime. Deploying the fixture with the existing JS adapter cannot verify its HTTP
contract, and adding a successful skipped assertion would not test that contract.

The main suite verifies public HTTP behavior in dev and start modes. Its start-mode
adapter test copies each emitted executable and its assets into an isolated
function directory, starts it without Next.js or Go, and exercises methods,
streaming, rewrites, routing headers, dynamic parameters and invalid configuration.
It also verifies Linux amd64 and arm64 outputs. This is executable adapter-contract
coverage, not a claim of hosted deployment coverage.

The `src/app` suite also moves local source directories and starts a local server.
The diagnostics suite intentionally invokes failing builds; these cannot be
deployed. Those checks are local by definition.

Once the deployment harness has a Go-capable adapter, enable a deploy smoke suite
for the public HTTP cases. Keep source mutation, process inspection, relocation and
failing-build checks local.
