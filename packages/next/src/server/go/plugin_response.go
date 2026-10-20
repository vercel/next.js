//go:build linux || darwin

package main

import (
	"bufio"
	"errors"
	"io"
	"net"
	"net/http"
	"strings"
)

// Preserve the native net/http handler API without serializing a request or
// response across a second connection. Header policy still applies to plugins.
type pluginWriter struct {
	http.ResponseWriter
	frontend                 *frontend
	conn                     *streamConn
	upgrade, hijacked, wrote bool
	hints                    int
	connection               []byte
}

func (w *pluginWriter) Unwrap() http.ResponseWriter { return w.ResponseWriter }

func (w *pluginWriter) forbiddenTrailer(name string) bool {
	lower := strings.ToLower(name)
	return w.frontend.internalHeader(name) || hopHeader([]byte(name), w.connection) || lower == "host" || lower == "content-length" || lower == "forwarded" || strings.HasPrefix(lower, "x-forwarded-")
}

func (w *pluginWriter) filter() bool {
	h := w.Header()
	if values := h.Values("Connection"); len(values) != 0 {
		w.connection = append(w.connection, []byte(","+strings.Join(values, ","))...)
	}
	var trailers []string
	for _, value := range h.Values("Trailer") {
		for _, name := range strings.Split(value, ",") {
			name = strings.TrimSpace(name)
			valid := name != ""
			for _, c := range []byte(name) {
				if !token(c) {
					valid = false
				}
			}
			if valid && !w.forbiddenTrailer(name) {
				trailers = append(trailers, name)
			} else {
				h.Del(name)
			}
		}
	}
	cleanHeader(h, w.frontend.internalHeader)
	for name := range h {
		if strings.HasPrefix(name, http.TrailerPrefix) && w.forbiddenTrailer(strings.TrimPrefix(name, http.TrailerPrefix)) {
			delete(h, name)
		}
	}
	if len(trailers) != 0 {
		h.Set("Trailer", strings.Join(trailers, ", "))
	}
	size, count := 0, 0
	for name, values := range h {
		for _, c := range []byte(strings.TrimPrefix(name, http.TrailerPrefix)) {
			if !token(c) {
				return false
			}
		}
		for _, value := range values {
			for _, c := range []byte(value) {
				if c < 32 && c != '\t' || c == 127 {
					return false
				}
			}
			count++
			size += len(name) + len(value) + 4
		}
	}
	return count <= 128 && size <= requestLimit
}

func (w *pluginWriter) WriteHeader(status int) {
	if w.wrote || w.hijacked {
		return
	}
	if !w.filter() {
		clear(w.Header())
		w.Header().Set("Connection", "close")
		w.ResponseWriter.WriteHeader(http.StatusBadGateway)
		w.wrote = true
		panic(http.ErrAbortHandler)
	}
	if status >= 100 && status < 200 {
		w.hints++
		if status == 101 || w.hints > 8 {
			panic(http.ErrAbortHandler)
		}
	} else {
		w.wrote = true
	}
	w.ResponseWriter.WriteHeader(status)
}

func (w *pluginWriter) Write(p []byte) (int, error) {
	if !w.wrote {
		w.WriteHeader(http.StatusOK)
	}
	return w.ResponseWriter.Write(p)
}

func (w *pluginWriter) WriteString(s string) (int, error) {
	if !w.wrote {
		w.WriteHeader(http.StatusOK)
	}
	return io.WriteString(w.ResponseWriter, s)
}

func (w *pluginWriter) FlushError() error {
	if !w.wrote {
		w.WriteHeader(http.StatusOK)
	}
	return http.NewResponseController(w.ResponseWriter).Flush()
}

func (w *pluginWriter) Flush() {
	if w.FlushError() != nil {
		panic(http.ErrAbortHandler)
	}
}

func (w *pluginWriter) Hijack() (net.Conn, *bufio.ReadWriter, error) {
	if !w.upgrade || w.wrote {
		return nil, nil, errors.New("native hijacking requires an HTTP upgrade before response headers")
	}
	c, buffer, err := http.NewResponseController(w.ResponseWriter).Hijack()
	if err == nil {
		w.hijacked = true
		w.conn.upgrade.Store(1)
	}
	return c, buffer, err
}

func (w *pluginWriter) finish() {
	if w.hijacked {
		return
	}
	if !w.wrote {
		w.WriteHeader(http.StatusOK)
	}
	if !w.filter() {
		panic(http.ErrAbortHandler)
	}
	for name := range w.Header() {
		trailer := strings.TrimPrefix(name, http.TrailerPrefix)
		if w.forbiddenTrailer(trailer) {
			delete(w.Header(), name)
		}
	}
}
