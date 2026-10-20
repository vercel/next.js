//go:build linux || darwin

package main

import (
	"bufio"
	"bytes"
	"errors"
	"io"
	"strconv"
	"time"
)

const (
	streamHeader = iota
	streamBody
	streamChunk
	streamChunkData
	streamChunkEnd
	streamTrailers
	streamUpgrade
	streamClose
)

// This reader preserves the original wire bytes. It releases only validated
// headers and bounded body frames to net/http, including on reused connections.
// net/http remains the HTTP parser and response writer; no request is replayed.
// streamConn serializes reads, including reads after application hijacking.
type strictRequests struct {
	conn        *streamConn
	reader      *bufio.Reader
	pending     []byte
	prefix      []byte // The one byte net/http may read ahead before an upgrade decision.
	state       int
	afterBody   int
	remaining   int64
	failed      error
	headerLimit time.Time
}

func (s *strictRequests) fail(err error) (int, error) {
	if err == io.EOF {
		err = io.ErrUnexpectedEOF
	}
	s.failed = err
	return 0, err
}

func (s *strictRequests) Read(p []byte) (int, error) {
	if len(p) == 0 {
		return 0, nil
	}
	for {
		if s.failed != nil {
			return 0, s.failed
		}
		if len(s.pending) != 0 {
			n := copy(p, s.pending)
			s.pending = s.pending[n:]
			return n, nil
		}
		if s.conn.upgrade.Load() == 1 {
			// A saved read-ahead byte is already in net/http's hijacked buffer.
			s.prefix = nil
			return s.reader.Read(p)
		}
		switch s.state {
		case streamHeader:
			if s.headerLimit.IsZero() {
				s.conn.protocolDeadline(time.Now().Add(exchangeTimeout))
				if len(s.prefix) == 0 {
					if _, err := s.reader.Peek(1); err != nil {
						return 0, err
					}
				}
				s.headerLimit = time.Now().Add(5 * time.Second)
			}
			s.conn.protocolDeadline(s.headerLimit)
			tail, err := peekHeader(s.reader)
			if err != nil {
				// Peek does not consume partial headers. abortPendingRead may
				// interrupt this read; clearing its deadline must allow a retry.
				if err == io.EOF {
					err = io.ErrUnexpectedEOF
				}
				return 0, err
			}
			raw := tail
			if len(s.prefix) != 0 {
				raw = append(append([]byte(nil), s.prefix...), tail...)
			}
			h, err := checkedRequestHeader(raw)
			if err != nil {
				return s.fail(err)
			}
			s.prefix = nil
			s.headerLimit = time.Time{}
			s.pending = tail
			s.reader.Discard(len(tail))
			s.afterBody = streamHeader
			if h.close {
				s.afterBody = streamClose
			}
			chunked := false
			for _, field := range h.fields[:h.n] {
				if eq(field.name, "Upgrade") {
					s.conn.upgrade.Store(0)
					s.afterBody = streamUpgrade
				}
				if eq(field.name, "Transfer-Encoding") {
					chunked = true // checkedRequest permits only one chunked coding.
				}
			}
			s.state = s.afterBody
			if chunked {
				s.state = streamChunk
			} else if h.length > 0 {
				s.remaining, s.state = h.length, streamBody
			}
			s.conn.protocolDeadline(time.Now().Add(exchangeTimeout))
		case streamBody, streamChunkData:
			if int64(len(p)) > s.remaining {
				p = p[:s.remaining]
			}
			n, err := s.reader.Read(p)
			if err == io.EOF {
				err = io.ErrUnexpectedEOF
			}
			s.remaining -= int64(n)
			if s.remaining == 0 {
				if s.state == streamBody {
					s.state = s.afterBody
				} else {
					s.state = streamChunkEnd
				}
			}
			return n, err
		case streamChunk:
			line, err := s.reader.ReadSlice('\n')
			if err != nil {
				return s.fail(err)
			}
			if len(line) > 4096 || !bytes.HasSuffix(line, []byte("\r\n")) {
				return s.fail(errors.New("invalid chunk line"))
			}
			size, _, _ := bytes.Cut(line[:len(line)-2], []byte(";"))
			if len(size) == 0 || len(size) > 16 {
				return s.fail(errors.New("empty chunk size"))
			}
			for _, ch := range size {
				if !(ch >= '0' && ch <= '9' || ch >= 'a' && ch <= 'f' || ch >= 'A' && ch <= 'F') {
					return s.fail(errors.New("invalid chunk size"))
				}
			}
			n, err := strconv.ParseInt(string(size), 16, 64)
			if err != nil {
				return s.fail(err)
			}
			s.pending, s.remaining = line, n
			s.state = streamChunkData
			if n == 0 {
				s.state = streamTrailers
			}
		case streamChunkEnd:
			end, err := s.reader.Peek(2)
			if err != nil {
				return s.fail(err)
			}
			if string(end) != "\r\n" {
				return s.fail(errors.New("invalid chunk boundary"))
			}
			s.pending, s.state = end, streamChunk
			s.reader.Discard(2)
		case streamTrailers:
			end, err := s.reader.Peek(2)
			if err != nil {
				return s.fail(err)
			}
			if string(end) != "\r\n" {
				end, err = peekHeader(s.reader)
				if err != nil {
					return s.fail(err)
				}
				h, err := parseHeader(append([]byte("TRAILERS\r\n"), end...))
				if err != nil {
					return s.fail(err)
				}
				for _, f := range h.fields[:h.n] {
					if eq(f.name, "Content-Length") || eq(f.name, "Transfer-Encoding") || eq(f.name, "Trailer") {
						return s.fail(errors.New("invalid trailer framing field"))
					}
				}
			}
			s.pending, s.state = end, s.afterBody
			s.reader.Discard(len(end))
		case streamUpgrade:
			if s.conn.upgrade.Load() == 2 {
				s.state = streamHeader
				continue
			}
			// net/http performs at most a one-byte background read. Preserve
			// it in the next validation if the handler declines the upgrade;
			// on Hijack it is already returned in net/http's buffered reader.
			b, err := s.reader.ReadByte()
			if err != nil {
				return 0, err
			}
			s.prefix, s.state = []byte{b}, streamHeader
			p[0] = b
			return 1, nil
		case streamClose:
			// Do not synthesize EOF before the promised response is delivered.
			// net/http closes after that response and never dispatches this byte.
			return s.reader.Read(p[:1])
		default:
			return s.fail(io.ErrUnexpectedEOF)
		}
	}
}
