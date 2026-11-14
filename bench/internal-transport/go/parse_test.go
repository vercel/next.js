package main

// Parse and serialize cost alone, without sockets: what a framing could save
// per request on the Go side.
//
//	go test -bench . -benchmem

import (
	"bufio"
	"bytes"
	"io"
	"net/http"
	"strings"
	"testing"
)

func httpRequestBytes() []byte {
	var b strings.Builder
	b.WriteString("GET " + requestTarget + " HTTP/1.1\r\n")
	for _, h := range requestHeaders {
		b.WriteString(h.name + ": " + h.value + "\r\n")
	}
	b.WriteString("\r\n")
	return []byte(b.String())
}

func BenchmarkHTTPReadRequest(b *testing.B) {
	raw := httpRequestBytes()
	r := bytes.NewReader(raw)
	br := bufio.NewReader(r)
	b.SetBytes(int64(len(raw)))
	for b.Loop() {
		r.Reset(raw)
		br.Reset(r)
		req, err := http.ReadRequest(br)
		if err != nil {
			b.Fatal(err)
		}
		_ = req
	}
}

func BenchmarkFramedParseRequest(b *testing.B) {
	req := frameRequest{method: "GET", target: requestTarget, headers: requestHeaders}
	raw := appendEnd(appendRequestHead(nil, &req))
	r := bytes.NewReader(raw)
	br := bufio.NewReader(r)
	var head []byte
	b.SetBytes(int64(len(raw)))
	for b.Loop() {
		r.Reset(raw)
		br.Reset(r)
		var err error
		head, err = readHead(br, head)
		if err != nil {
			b.Fatal(err)
		}
		if _, err := parseRequestHead(head); err != nil {
			b.Fatal(err)
		}
		if _, err := readBody(br); err != nil {
			b.Fatal(err)
		}
	}
}

func BenchmarkHTTPWriteResponse(b *testing.B) {
	payload := body(13)
	w := bufio.NewWriter(io.Discard)
	for b.Loop() {
		res := http.Response{
			StatusCode: 200, ProtoMajor: 1, ProtoMinor: 1,
			Header:        http.Header{},
			ContentLength: int64(len(payload)),
			Body:          io.NopCloser(bytes.NewReader(payload)),
		}
		for _, h := range responseHeaders {
			res.Header[http.CanonicalHeaderKey(h.name)] = []string{h.value}
		}
		_ = res.Write(w)
		_ = w.Flush()
	}
}

func BenchmarkFramedWriteResponse(b *testing.B) {
	payload := body(13)
	var out []byte
	for b.Loop() {
		out = appendEnd(appendChunk(appendResponseHead(out[:0], 200, responseHeaders), payload))
	}
}
