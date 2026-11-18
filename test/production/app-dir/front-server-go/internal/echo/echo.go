// Package echo answers with what the Go worker received, so tests can compare
// the request a route.go sees with and without the front server.
package echo

import (
	"encoding/json"
	"io"
	"net/http"
	"os"
)

type Received struct {
	Method        string              `json:"method"`
	RequestURI    string              `json:"requestURI"`
	RawQuery      string              `json:"rawQuery"`
	Host          string              `json:"host"`
	Proto         string              `json:"proto"`
	ContentLength int64               `json:"contentLength"`
	Body          string              `json:"body"`
	Header        map[string][]string `json:"header"`
	Params        map[string]string   `json:"params"`
	// The worker's TCP peer: which process sent this request.
	RemoteAddr string `json:"remoteAddr"`
	Pid        int    `json:"pid"`
}

// Serve writes the request as JSON. params names the route's path values.
func Serve(w http.ResponseWriter, r *http.Request, params ...string) {
	body, _ := io.ReadAll(r.Body)
	values := map[string]string{}
	for _, name := range params {
		values[name] = r.PathValue(name)
	}
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(Received{
		Method:        r.Method,
		RequestURI:    r.RequestURI,
		RawQuery:      r.URL.RawQuery,
		Host:          r.Host,
		Proto:         r.Proto,
		ContentLength: r.ContentLength,
		Body:          string(body),
		Header:        r.Header,
		Params:        values,
		RemoteAddr:    r.RemoteAddr,
		Pid:           os.Getpid(),
	})
}
