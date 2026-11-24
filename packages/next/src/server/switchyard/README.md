# Switchyard

Switchyard is an experimental Go server in front of `next start`, enabled with `__NEXT_EXPERIMENTAL_SWITCHYARD=1`. It owns the public port and forwards each request to the Node server on a private loopback port (`main.go`). The Node side is `packages/next/src/server/lib/switchyard.ts`.

## Matching `next start`

Switchyard aims to behave the way `next start` does without it: what a client receives and what the app's code sees should be the same. Matching is pragmatic. Each difference that remains is listed below, so a difference is a decision, not an accident.

Code that exists only to copy what Node does is marked with a `Node parity:` comment saying which behavior it copies, so it's easy to find and to remove later.

## Differences from `next start`

What a client or the app sees differently with Switchyard on. Some are pinned by tests in `test/production/app-dir/switchyard`, which expect the two results side by side.

### Responses

- **Reason phrases:** responses carry Go's standard reason phrase for their status, never the app's (`res.statusMessage`, or `statusText` on a route handler's `Response`). HTTP/2 and HTTP/3 don't send reason phrases at all.
- **Header names and order:** response headers are written with Go's capitalization (`Content-Type`), sorted by name.
- **`Transfer-Encoding: identity`** set by the app produces a `502`.
- **A body longer than its `Content-Length`** is cut to that length. Without Switchyard, the extra bytes reach the client.
- **Chunk boundaries** of a streamed response can differ, though the bytes are the same.

### Requests

- **Header names and order:** the app sees request headers with Go's capitalization, sorted by name, `Host` first, in `req.rawHeaders` and in the key order of `req.headers`. Values are unchanged.
- **More than 1000 header lines:** Switchyard answers Node's `431`. Node reads the first 1000 and drops the rest without an answer; Switchyard can't drop the same ones, because Go's parser doesn't keep the order of different headers.
- **Header size, while the headers are still arriving:** Node answers `431` as soon as its count reaches the limit. Switchyard applies Node's count once the headers are complete, and stops reading incomplete ones a few KB past the limit with Go's own `431`.
- **`Content-Length: 0`:** a `POST` or `PUT` without a body reaches the app with `content-length: 0`, and a `GET`, `HEAD`, `DELETE` or `OPTIONS` that sent `Content-Length: 0` reaches it without one.
- **Request targets:** an absolute-form target (`GET http://other.example/p`) reaches the app as the path, with the target's host as `Host`. An empty `Host` is replaced with Switchyard's public address.
- **Retries:** when Node closes a reused connection without answering a request with no body (`GET`, `HEAD`, `OPTIONS`, `TRACE`), Go's HTTP client sends the request again on a new connection.

### Connections

- **Idle keep-alive connections** close when the keep-alive timeout runs out. Node advertises the same timeout but keeps the connection about a second longer (`keepAliveTimeoutBuffer`).
- **When Node can't be reached**, the client gets `502 Bad Gateway`. Without Switchyard there is no server to connect to.- **An early answer without a length to an upload** (a streamed response sent before the request body has arrived) ends at once, as in Node, but then the connection closes. Node reads the rest of the upload and keeps the connection open.
- **When Switchyard closes a connection on its own**, such as while shutting down, the response can carry Node's `Keep-Alive` header next to `Connection: close`.
- **HTTP/1.0 clients:** the status line reads `HTTP/1.0`. The connection closes after every response; Node keeps it open when the request asked for keep-alive and the app set `Content-Length` itself. Responses carry the `Content-Length` Node computed, which Node leaves out for HTTP/1.0.

### Malformed and unusual requests

Go's HTTP parser accepts and rejects different requests than Node's:

- **Go accepts, Node answers `400`:** bare-LF line endings, folded header lines, `Content-Length` together with `Transfer-Encoding: chunked`, a repeated identical `Content-Length`, `HTTP/1.2`.
- **Go rejects, Node accepts:** a repeated `Host` (`400`), `Transfer-Encoding: gzip, chunked` (`501`), an `HTTP/2.0` request line (`505`), HTTP/0.9 (`400`).
- **Go's own error answers** have a plain-text body and can carry detail in the reason phrase (`400 Bad Request: missing required Host header`). Node's are empty with `Connection: close`.
- **Methods Node doesn't know** (`FOO`, lowercase `get`) get Node's `400`, but the connection stays open. `CONNECT` gets `502`; Node closes the connection.
- **`Expect` values other than `100-continue`** get Go's `417`, which closes the connection.

## Checks that need the raw request

Go's parser rewrites some of what a client sends before Switchyard's handler sees the request, so matching Node there needs a check on the raw request bytes, before Go's parser. Not built yet:

- rejecting bare-LF line endings, folded header lines, `Content-Length` together with `Transfer-Encoding`, and a repeated `Content-Length`, as Node does
- answering malformed requests with Node's bytes
- keeping the client's header capitalization and order for `req.rawHeaders`
