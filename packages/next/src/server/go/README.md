# Precompiled Go frontend and application worker contract

This experimental production frontend is compiled when building the `next` package,
not when building an application. `taskr go_frontend` publishes pure-Go Linux and
macOS executables for amd64 and arm64 in `dist/server/go`. Building the framework
requires Go 1.24+ (`TURBOPACK_GO` can select the compiler). Windows and other targets
are explicitly unsupported by `experimental.goServer`; the existing Node-based
`experimental.goRoutes` mode is separate.

Application `next build` compiles only the generated worker adapter and user
packages through the existing Turbopack Go graph. Next copies the shipped frontend
into `.next/server/go-front`. The v2 `go-server.json` contains workers, routes,
public assets and URL configuration. Its NFT trace includes the frontend and
content-addressed worker executable. Copy all traced files and preserve executable
permissions for relocation to the same OS/architecture. Startup never compiles.
The executable rejects non-regular or non-executable worker files and relative
paths escaping its manifest directory. Routing changes do not change frontend
executable bytes.

## Versioned worker interface

The manifest registers each worker by ID, executable basename and protocol
`next-worker-http/1`. Routes name a worker and opaque handler ID. Empty worker IDs
select the private Next.js fallback. The frontend matches each request separately;
connections do not remain assigned to one backend.

The frontend starts a worker once, inheriting application environment/cwd. It
sends one bounded JSON control line on stdin:

```json
{"version":1,"socket":"<private socket path>","token":"<random credential>"}
```

The worker binds the supplied Unix socket with mode 0600 inside a private 0700
directory. Only after binding and initializing handlers does it write exactly
`next-worker-http/1\n` to inherited descriptor 3 and close that descriptor. Stdout
and stderr are application logs, never a readiness or authentication channel.
All workers must become ready within one ten-second startup deadline. The public
listener is not opened until readiness and manifest validation succeed. Failed
startup kills and reaps every started worker. No token is embedded in build output
or printed in readiness messages.

Requests use persistent private HTTP/1.1 connections, one active exchange per
connection. `Host`, raw query, body bytes and repeated end-to-end fields are
preserved. The frontend supplies authenticated `X-Next-Go-Upstream-Token`,
`X-Next-Go-Metadata` (unpadded base64url JSON containing `handler` and `params`),
and `X-Next-Go-Remote` (the actual public TCP peer IP). Workers authenticate before
reading metadata, dispatch only the registered handler ID, and remove these fields
before invoking application code. Go adapters retain `net/http`, `Methods`,
`ParamValues` and `r.PathValue`. Other languages can implement the same contract
without being linked into the frontend. This is an internal versioned protocol,
not a stable third-party SDK yet.

## HTTP paths and lifecycle

Linux uses epoll and macOS uses kqueue. Up to two readiness loops own their socket
state and pools. A bodyless request with an ordinary fixed-length response uses
bounded raw forwarding without `net/http.Server`, `ReverseProxy` or `Transport` in
the frontend data path. Every response header is filtered, including the case with
no `Connection` field. Upstream reuse checks for unread bytes/EOF first.

Request bodies, chunking, trailers, informational responses, close-delimited
responses and upgrades use a bounded streaming bridge. A connection is handed off
before response bytes are published; an already-sent request is never replayed.
The bridge validates **every** subsequent public request, canonicalizes framing
with Go's HTTP parser/writer through an unbuffered pipe, and uses the standard HTTP
transport. There is no silent rejection of normal uploads or streaming responses
just because the fast path is narrower. Slow paths still select a backend per
request, preserve ordered responses, and propagate cancellation. Upgrade tunnels
retain the same socket/memory budgets and write deadlines.

Supported public transport is cleartext HTTP/1.1, normally behind TLS termination.
HTTP/1.0, direct TLS, HTTP/2 prior knowledge, CONNECT authority form, non-origin
request targets and ambiguous framing are rejected with a closing error. Invalid
upstream framing closes that upstream; after public response bytes have started,
the client connection is closed rather than appending a second response. Paths
must be ASCII escaped with valid UTF-8 after decoding. Dot segments, backslashes,
empty internal path segments and control characters are rejected. Encoded slashes
remain inside one parameter; they never become additional routing segments. Native
workers dispatch by the authenticated handler ID, not by rerouting decoded paths.
Node cannot rewrite into a native handler. Base paths, public assets and static
route priority are represented in the manifest.

This scope is production build/start only. Deployment replacement starts a new
immutable frontend/worker generation, waits for its readiness, then drains the old
generation. Live `next dev` worker replacement is not enabled. A worker crash
fails active exchanges and drains/exits the frontend; the process supervisor can
restart the application. There is no automatic replay of a possibly executed
request. On shutdown the listener stops admitting requests, idle connections close,
admitted requests get up to twenty seconds, then remaining connections and workers
are terminated. Workers are waited/reaped and private socket directories removed.

## Security model and budgets

This is a preliminary implementation review and threat model, **not a completed
security audit or a claim of HTTP security parity**. Application code, build output,
the parent Node process, the Go SDK and configured proxy operators are trusted.
Worker processes run with application privileges; this is not a sandbox for
untrusted tenants. Public requests, worker framing errors, and slow/disconnected
peers must not control the selected executable, socket address or private token.

| Boundary / threat | Enforcement |
| --- | --- |
| Smuggling / connection poisoning | Exactly one nonempty valid Host; reject duplicate Content-Length, CL+TE, duplicate/unsupported transfer coding, folded/invalid fields, invalid Connection options and framing nominations. Strict parsing repeats after streaming handoff. Go owns complex-body framing. Do not pool unexpected bytes, EOF or malformed responses. |
| Response metadata / hop fields | Filter hop-by-hop fields on every path and all Connection-nominated fields. Remove reserved worker fields; filter trailers as well as headers. Preserve repeated cookies. |
| Forged routing and identity | Strip incoming `x-next-go-*` and Next's shared `INTERNAL_HEADERS` list before injecting private metadata. The Node fallback authenticates and removes its token from both normalized/raw headers. No user-supplied upstream URL is used. |
| Slow headers / responses | Absolute five-second public header deadlines, thirty-second upstream response-header deadline, fifteen-second I/O inactivity/write deadlines and a five-minute exchange deadline. Bytes cannot extend the absolute header/exchange deadline. |
| Global exhaustion | 1,024 reserved data sockets, separately capped at 512 clients and 512 upstreams; a shared 256MiB reservation budget (128KiB/socket plus 2MiB per streaming connection); at most 128 streaming connections. Overload has no unbounded queue. Idle pools total at most 128 reactor plus 128 transport connections, max 32/backend/pool, with 15s retirement. |
| Event-loop starvation | At most 256 readiness events/batch, 64 accepts/dispatch and 16 read/write attempts per event. At most 128 path segments and 4,096 trie visits per lookup; header bytes/count are capped at 32KiB/128. |
| Child startup / transport leakage | Random independent worker credentials, private Unix directory/socket permissions, bounded version/readiness messages, aggregate startup deadline, parent-EOF shutdown, process reaping and bounded drain. |

Reservations bound frontend-owned buffering/work; Go runtime/GC overhead, kernel
socket buffers, fixed manifest data and application-worker allocations are not a
hard RSS guarantee. Use OS/container limits for a hard process-memory/CPU budget.
The manifest is bounded at 16MiB and 100,000 routes/64 workers. These limits are
experimental policy, not configuration inferred from request headers.

By default `Forwarded` and all inbound `X-Forwarded-*` are discarded and rebuilt
from the actual socket peer, validated Host and cleartext `http`. Operators may set
`NEXT_GO_TRUSTED_PROXIES` to comma-separated CIDRs for adjacent proxies. For trusted
peers, XFF is validated and walked right-to-left; claims to the left of the first
untrusted address are removed. Forwarded host/protocol must be a single valid
value. The adjacent trusted proxy **must overwrite** client-supplied forwarded
host/protocol. Trusting an address range does not sanitize a misconfigured proxy.
The standard `Forwarded` field is not accepted as an alternate identity authority.

The custom incoming fields are listed in Next's `INTERNAL_HEADERS` filter and must
remain part of security review when the protocol changes. Any newly consumed
request metadata requires the same explicit filtering and authenticated boundary.

## Verification

Run `go test -race ./...` from this directory. Unit/integration cases include raw
pipelining and backend alternation, strict framing after handoff, slow-client
absolute deadlines, cookies/hop fields, chunked upload/response trailers, upgrades,
cancellation, the actual generated SDK, budget accounting and Go/Node differential
request targets. Run both fuzz targets with `go test -run='^$' -fuzz=<name>`:
`FuzzRequestFraming` (accepted headers must also parse with Go) and
`FuzzResponseFraming`. Race/fuzz results do not establish security parity.

Framework integration lives in `test/production/app-dir/go-front-server` and
`go-worker-security`. The latter verifies actual worker PID separation, metadata
filtering, reused connections, body/trailer/cancellation behavior and stable
frontend bytes across application recompilation. CI runs the standalone contract
on Linux/macOS and Go 1.24/1.27. Performance acceptance must separately measure
cheap handlers, uploads and streaming against the prior jointly linked frontend;
the earlier React-rendering benchmark measured only the Node fallback.
