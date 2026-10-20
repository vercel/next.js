# Precompiled Go frontend and application plugins

The experimental production frontend is compiled while building the `next` package.
Application `next build` compiles one separately loadable Go plugin containing the
user's routes. The shipped frontend has no application imports. It loads the
plugin once before opening its public listener, resolves the handler registry once,
and calls typed Go functions directly. Native requests do not use another process,
Unix socket, loopback listener, HTTP transport, or C ABI callback.

## Build and deployment contract

`taskr go_frontend` builds a native CGO-enabled host and a `.build.json` sidecar
containing its exact Go version, target, relevant compiler settings and SHA256.
Release CI builds Linux/glibc and macOS hosts natively for amd64 and arm64 with
Go1.27.2; packaging validates and collects all four artifacts. Local development
builds only the host platform. Windows and Linux/musl are unsupported by
`experimental.goServer`. The separate Node-based `goRoutes` mode is unchanged.

The application compiler must use the exact host toolchain version; select it with
`TURBOPACK_GO`. Application packages remain pure Go, but plugin linking requires
CGO and a native C compiler. The compiler uses `-buildmode=plugin`, `-trimpath`,
`-buildvcs=false`, empty build tags and a controlled environment. The existing
Turbopack graph tracks generated overlays, source, dependencies and embedded files.
It does not edit application sources or module metadata, download dependencies,
or persist native task results across build sessions.

The version3 `go-server.json` registers plugins by ID, confined `.so` basename and
`next-go-plugin/1` interface. Routes name a plugin and opaque handler ID; an empty
plugin selects Node. The generated entry exports `NextGoPluginVersion` and
`NextGoHandlers`, a map of
`func(http.ResponseWriter, *http.Request, map[string][]string)`. Only standard-library
types cross this interface, avoiding a separately versioned common SDK package.
The adapter retains `Methods`, `ParamValues` and `r.PathValue`.

Before executing plugin initialization, the frontend reads the library's Go build
information and checks toolchain, target, CGO, trimpath, build tags, architecture
tuning, experiments and instrumentation flags against its own build. Go's loader
also checks common-package hashes. Common dependencies must come from matching
sources; arbitrary custom toolchains are not a stable ABI. All plugins share one
ten-second initialization deadline. Registration, compatibility or initialization
failure prevents public readiness and terminates startup. The surrounding Node
supervisor bounds termination if application initialization does not return.

NFT traces include the frontend, build sidecar and content-addressed plugin.
Copy all traced files to relocate on the same OS/architecture and compatible
system C runtime. Preserve executable permissions on the frontend. Startup reads
the manifest once and invokes no compiler. Recompiling handlers changes the plugin
bytes and filename while preserving frontend bytes.

## Request handling and lifecycle

The existing Linux epoll/macOS kqueue listener still handles bounded admission and
raw fixed-length Node forwarding. A connection admitting a plugin request moves
to the strict streaming path. A bounded reader validates every subsequent raw
header and body boundary while preserving wire bytes. `net/http` reads directly
from the public socket and owns HTTP handling, body backpressure, cancellation,
streamed responses and upgrades. There is no framing pipe or request reserialization.
Requests on reused connections continue
to choose Go or Node independently. Go handlers receive decoded parameters directly,
without encoding worker metadata. Node alone uses the authenticated private HTTP
fallback. A plugin response wrapper filters reserved/hop headers and trailers and
preserves Flusher, ResponseController, and HTTP-upgrade Hijacker behavior.

The public transport is cleartext HTTP/1.1 behind TLS termination. HTTP/1.0,
direct TLS/HTTP2, CONNECT/non-origin targets and ambiguous framing are rejected.
Paths require ASCII escaping and valid decoded UTF8. Dot segments, backslashes,
empty internal segments and control characters are rejected. Encoded slashes stay
inside one routing parameter. Public assets/static route priority, basePath and
trailing-slash normalization are manifest data. Go routes bypass JavaScript
proxy.ts/rewrites/redirects/custom headers; Node cannot rewrite into a native route.

This implementation is production build/start only. Replacement starts a fresh
frontend process, waits for readiness, then drains the old generation. Plugins
cannot be unloaded or safely replaced in the existing process. A handler panic
aborts its connection; process exit or a fatal runtime error terminates the whole
frontend and its Node supervisor. No possibly executed request is replayed.
Shutdown stops admission, closes idle connections and gives admitted work twenty
seconds before closing remaining connections. The parent bounds process shutdown.

## Security model and budgets

Application plugins, build output, toolchains and the Node parent are trusted.
Plugins share the frontend's runtime, heap and privileges. They provide neither
process isolation nor a tenant sandbox. The plugin loader is not a general-purpose
language-neutral ABI; other language backends can be added separately. Race-detector
support for dynamically loaded Go plugins is limited; passing race tests is not a
complete concurrency or HTTP security audit.

Public requests cannot choose a library path, handler symbol or upstream address.
Library files must be regular, non-symlink `.so` files confined to the manifest
directory. Handler IDs and interfaces are checked before admission. Internal
`x-next-go-*` and Next `INTERNAL_HEADERS` are stripped before application dispatch;
Node fallback credentials never reach Go handlers. Hop fields and their
Connection-nominated names are filtered from responses and trailers.

The existing strict boundary rejects duplicate Content-Length, CL+TE, duplicate or
unsupported transfer coding, folded/invalid fields, invalid Connection options and
multiple/empty Host. Validation repeats after streaming handoff; requests are never
replayed after bytes have reached a backend. Malformed Node responses close that
upstream and cannot poison a subsequent request.

Budgets remain global:1024 data sockets (512clients/512upstreams),256MiB reserved
frontend buffering,128 streaming connections with2MiB reservation each,128 pooled
raw and128 transport connections, max32 per backend/pool and15s retirement.
Header size/count are32KiB/128; absolute header deadlines are5s, upstream header
30s, exchange5min and I/O/write inactivity15s. Readiness loops bound events,
accepts and per-event I/O; route lookup bounds depth128 and trie visits4096.
Application allocations, Go runtime/GC and kernel buffers are outside these
reservations; use container/OS limits for a hard RSS/CPU limit.

Forwarded identity is rebuilt from the socket peer unless an adjacent proxy CIDR
is explicitly trusted through `NEXT_GO_TRUSTED_PROXIES`. Trusted XFF chains are
validated and walked right-to-left. The adjacent proxy must overwrite client
forwarded host/protocol. The standard Forwarded header is not an alternate source
of identity authority.

## Verification

`go test -race -count=1 ./...` covers strict parser/framing reuse, cancellation,
streaming/trailers/upgrades, budget accounting, Go/Node differential targets,
actual generated plugin loading and matching compiler flags. Contract tests verify
that handlers run in the host PID with zero native upstream sockets, and that a
mismatched build is rejected before its init function executes. Run
`FuzzRequestFraming`, `FuzzResponseFraming` and `FuzzStrictStreamFraming` separately
with Go fuzzing. The stream fuzzer checks unchanged bytes and net/http agreement
across bodies, chunk frames, trailers and reused connections. Upgrade tests include
early opaque bytes and a declined upgrade followed by validated pipelining.

Framework suites remain under `test/production/app-dir/go-front-server` and
`go-worker-security` (the latter now verifies the plugin boundary). They verify
PID relationships, internal-header filtering, reused Go/Node connections,
streaming/cancellation, stable frontend bytes after handler rebuild, tracing and
relocation without a compiler. Compiler tests build/load a real plugin and verify
source invalidation while preserving the existing executable-mode CLI tests.

Measure the actual integrated frontend separately from isolated plugin prototypes:
the wire validator, header policy and admission budgets add work absent from
the minimal benchmark host. Cheap handlers, uploads and streaming all need matched
CPU allocations and boot-level confidence intervals before performance claims.
