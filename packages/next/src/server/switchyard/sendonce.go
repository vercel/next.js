package main

import (
	"context"
	"errors"
	"net/http"
	"net/url"
	"sync/atomic"
)

// Go's Transport sends a request again when the connection it was sent on
// had been used before and closed without any response, if the request has
// no body and is a GET, HEAD, OPTIONS or TRACE or carries an Idempotency-Key.
// That hides a server closing an idle connection just as a request goes out,
// but it also repeats a request the server did run: a handler that crashes
// before answering runs again, once for each idle connection the Transport
// tries. Node's HTTP client never sends a request twice, so Switchyard
// doesn't either. Its idle timeouts already keep it from sending on a
// connection the server is closing (see upstreamIdle).
//
// The Transport has no option to turn this off. It calls Proxy before each
// attempt, so sendAtMostOnce, as the Transport's Proxy, refuses every attempt
// after the first for a request marked with sendOnce. The Transport then
// returns that error instead of sending the request again.
// TestNodeGetsAReplayableRequestOnceWhenItHangsUpWithoutAnswering and
// TestAWorkerGetsAReplayableRequestOnceWhenItHangsUpWithoutAnswering fail if
// a Go release stops calling Proxy per attempt.

var errNotSentAgain = errors.New("connection closed before a response; not sending the request again")

type sentKey struct{}

// sendOnce marks r so that a Transport using sendAtMostOnce sends it at most
// once.
func sendOnce(r *http.Request) *http.Request {
	return r.WithContext(context.WithValue(r.Context(), sentKey{}, new(atomic.Bool)))
}

// sendAtMostOnce is a Transport's Proxy. It never names a proxy, so the
// Transport always connects directly, as with a nil Proxy.
func sendAtMostOnce(r *http.Request) (*url.URL, error) {
	if sent, ok := r.Context().Value(sentKey{}).(*atomic.Bool); ok && sent.Swap(true) {
		return nil, errNotSentAgain
	}
	return nil, nil
}
