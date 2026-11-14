//go:build linux

package main

import (
	"bytes"
	"errors"
	"strconv"
)

// Ported from vercel/vercel-internal#2065.

// Ordinary chunked bodies remain in the reactor. Announced trailers, upgrades
// use the existing net/http bridge before output.
func ordinaryChunked(h *messageHeader) bool {
	found := false
	for _, f := range h.fields[:h.n] {
		switch {
		case eq(f.name, "Transfer-Encoding"):
			if found || !eq(f.value, "chunked") {
				return false
			}
			found = true
		case eq(f.name, "Trailer"), eq(f.name, "Upgrade"), eq(f.name, "Expect"):
			return false
		}
	}
	return found
}

type chunkFramer struct {
	state          uint8 // size, data, data CR, data LF, trailers, done
	remaining      int64
	line           [4096]byte
	used, trailers int
	trailerAt      int
	connection     []byte
}

// Trailer fields are withheld as one bounded block until validation completes.
// This also protects metadata when a trailer name/value spans socket reads.
func (u *eventUpstream) acceptChunks(b []byte) ([]byte, error) {
	done, err := u.chunks.consume(b)
	if err != nil {
		return nil, err
	}
	u.remaining = 1
	if done {
		u.remaining = 0
	}
	cut := u.chunks.trailerAt
	if cut < 0 {
		return b, nil
	}
	if len(u.trailers) == 0 && done {
		return b, nil
	}
	// When this read first enters trailers, release its body prefix immediately.
	// Subsequent reads contain trailers only and stay bounded by requestLimit.
	u.trailers = append(u.trailers, b[cut:]...)
	if done {
		return u.trailers, nil
	}
	return b[:cut], nil
}
func (f *chunkFramer) consume(b []byte) (bool, error) {
	f.trailerAt = -1
	if f.state == 4 || f.state == 5 {
		f.trailerAt = 0
	}
	total := len(b)
	for len(b) > 0 {
		switch f.state {
		case 0, 4:
			ch := b[0]
			b = b[1:]
			if f.used == len(f.line) {
				return false, errors.New("chunk line limit")
			}
			f.line[f.used] = ch
			f.used++
			if f.state == 4 {
				f.trailers++
				if f.trailers > requestLimit {
					return false, errors.New("trailer limit")
				}
			}
			if ch != '\n' {
				continue
			}
			line := f.line[:f.used]
			if len(line) < 2 || line[len(line)-2] != '\r' {
				return false, errors.New("chunk CRLF")
			}
			line = line[:len(line)-2]
			f.used = 0
			if f.state == 4 {
				if len(line) == 0 {
					f.state = 5
					continue
				}
				colon := bytes.IndexByte(line, ':')
				if colon < 1 {
					return false, errors.New("trailer field")
				}
				for _, ch := range line[:colon] {
					if !token(ch) {
						return false, errors.New("trailer name")
					}
				}
				for _, ch := range line[colon+1:] {
					if ch < 32 && ch != '\t' || ch == 127 {
						return false, errors.New("trailer value")
					}
				}
				if hopHeader(line[:colon], f.connection) || eq(line[:colon], "Content-Length") || eq(line[:colon], "Host") || eq(line[:colon], "Forwarded") || len(line[:colon]) >= len("X-Forwarded-") && eq(line[:len("X-Forwarded-")], "X-Forwarded-") {
					return false, errors.New("forbidden trailer")
				}
				continue
			}
			size, ext, hasExt := bytes.Cut(line, []byte(";"))
			if hasExt {
				size = bytes.TrimRight(size, " \t")
			}
			if len(size) == 0 || len(size) > 16 {
				return false, errors.New("chunk size length")
			}
			for _, ch := range size {
				if !(ch >= '0' && ch <= '9' || ch >= 'a' && ch <= 'f' || ch >= 'A' && ch <= 'F') {
					return false, errors.New("chunk size")
				}
			}
			if hasExt {
				for _, ch := range ext {
					if ch < 32 && ch != '\t' || ch == 127 {
						return false, errors.New("chunk extension")
					}
				}
			}
			n, err := strconv.ParseInt(string(size), 16, 64)
			if err != nil {
				return false, err
			}
			f.remaining = n
			f.state = 1
			if n == 0 {
				f.state = 4
				f.trailerAt = total - len(b)
			}
		case 1:
			n := min(int64(len(b)), f.remaining)
			b = b[n:]
			f.remaining -= n
			if f.remaining == 0 {
				f.state = 2
			}
		case 2:
			if b[0] != '\r' {
				return false, errors.New("chunk data CR")
			}
			b = b[1:]
			f.state = 3
		case 3:
			if b[0] != '\n' {
				return false, errors.New("chunk data LF")
			}
			b = b[1:]
			f.state = 0
		case 5:
			return false, errors.New("bytes after chunked response")
		}
	}
	return f.state == 5, nil
}
