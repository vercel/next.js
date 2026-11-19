package main

import (
	"bytes"
	"net/http"
	"strconv"
)

// GET answers with a body of `size` bytes ("x" repeated), shaped by the
// query so tests can reach each choice Node's compression middleware makes:
//
//	type=png          a type that isn't compressible (default JSON)
//	length=N          a Content-Length header of N instead of Go's own
//	chunked=1         no Content-Length: headers are flushed before the body
//	parts=N           the body N times, flushed after each
//	encoding=E        a Content-Encoding header of E
//	cacheControl=C    a Cache-Control header of C
//	status=N          that status code
//	etag=1            a strong ETag
func GET(w http.ResponseWriter, r *http.Request) {
	q := r.URL.Query()
	size, _ := strconv.Atoi(q.Get("size"))
	typ := "application/json"
	if q.Get("type") == "png" {
		typ = "image/png"
	}
	w.Header().Set("Content-Type", typ)
	if length := q.Get("length"); length != "" {
		w.Header().Set("Content-Length", length)
	}
	if encoding := q.Get("encoding"); encoding != "" {
		w.Header().Set("Content-Encoding", encoding)
	}
	if control := q.Get("cacheControl"); control != "" {
		w.Header().Set("Cache-Control", control)
	}
	if q.Get("etag") == "1" {
		w.Header().Set("ETag", `"compress-etag"`)
	}
	status := http.StatusOK
	if s, err := strconv.Atoi(q.Get("status")); err == nil {
		status = s
	}
	w.WriteHeader(status)
	if q.Get("chunked") == "1" {
		w.(http.Flusher).Flush()
	}
	parts, err := strconv.Atoi(q.Get("parts"))
	if err != nil {
		parts = 1
	}
	body := bytes.Repeat([]byte("x"), size)
	for i := 0; i < parts; i++ {
		w.Write(body)
		if parts > 1 {
			w.(http.Flusher).Flush()
		}
	}
}
