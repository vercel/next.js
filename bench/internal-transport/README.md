# Internal transport benchmarks

Exploration for a shared transport between the processes `next start` runs
together (front server, Node, `route.go` workers). Not run in CI. The design
doc these numbers feed is kept outside the repo.

## What it measures

`run.mjs` runs one request at a time per connection, at concurrency 1 and 32,
for a 13-byte and a 64 KiB response, in both directions:

- `node->go`: Node's `http` client to a Go `net/http` server, like Node → `route.go`.
- `go->node`: Go's `http.Transport` to Node's `http.Server`, like the front → Node.

over loopback TCP and a Unix socket, with HTTP/1.1 and with a minimal
length-prefixed framing (`go/frame.go`, `node/frame.mjs`). Each side reports
CPU time per request (user + system, from `getrusage`/`process.cpuUsage()`),
excluding a warm-up.

`go/parse_test.go` measures HTTP/1.1 parsing and serialization in Go alone,
against the framing.

`native-route/` runs the real `NativeRouteManager` (transpiled from
`packages/next/src/server/lib`) in front of a worker built from the
`crates/next-api/src/templates/go_route_*.go` templates: once with the
templates at the base revision (TCP), once with the working tree's (Unix
socket).

## Running

```bash
export PATH=<go 1.24>/bin:$PATH
(cd go && go build -o ../tbench . && CGO_ENABLED=0 GOOS=linux GOARCH=arm64 go build -o ../tbench-linux-arm64 .)
node run.mjs ./tbench 5 1 darwin-r1
docker run --rm -v "$PWD":/b -w /b node:22 node run.mjs ./tbench-linux-arm64 5 1 linux-r1
node summarize.mjs linux
(cd go && go test -run x -bench . -benchmem)

native-route/build.sh <repo root> <base rev> <repo>/node_modules/.bin/tsc
(cd native-route && node run.mjs ../tbench 5 1 darwin)
```

`TBENCH_SOCKBUF=<bytes>` makes the Go side set `SO_SNDBUF`/`SO_RCVBUF` on Unix
connections (macOS defaults them to 8 KiB).

Results are in `results/`.
