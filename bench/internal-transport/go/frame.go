package main

// A minimal length-prefixed framing, the "something smaller than HTTP/1.1"
// candidate. One exchange at a time per connection, like HTTP/1.1 keep-alive.
//
//	request:  u32 headLen | head | chunk* | u32 0
//	  head:   str method | str target | u16 n | (str name | str value){n}
//	response: u32 headLen | head | chunk* | u32 0
//	  head:   u16 status | u16 n | (str name | str value){n}
//	chunk:    u32 len (> 0) | bytes
//	str:      u16 len | bytes
//
// Integers are big-endian. Nothing here is a proposal for a wire format; it
// only measures what dropping HTTP/1.1's text parsing would save.

import (
	"bufio"
	"encoding/binary"
	"errors"
	"io"
)

type header struct{ name, value string }

type frameRequest struct {
	method, target string
	headers        []header
}

func appendStr(b []byte, s string) []byte {
	b = binary.BigEndian.AppendUint16(b, uint16(len(s)))
	return append(b, s...)
}

func appendRequestHead(b []byte, r *frameRequest) []byte {
	start := len(b)
	b = append(b, 0, 0, 0, 0)
	b = appendStr(b, r.method)
	b = appendStr(b, r.target)
	b = binary.BigEndian.AppendUint16(b, uint16(len(r.headers)))
	for _, h := range r.headers {
		b = appendStr(b, h.name)
		b = appendStr(b, h.value)
	}
	binary.BigEndian.PutUint32(b[start:], uint32(len(b)-start-4))
	return b
}

func appendResponseHead(b []byte, status int, headers []header) []byte {
	start := len(b)
	b = append(b, 0, 0, 0, 0)
	b = binary.BigEndian.AppendUint16(b, uint16(status))
	b = binary.BigEndian.AppendUint16(b, uint16(len(headers)))
	for _, h := range headers {
		b = appendStr(b, h.name)
		b = appendStr(b, h.value)
	}
	binary.BigEndian.PutUint32(b[start:], uint32(len(b)-start-4))
	return b
}

func appendChunk(b []byte, p []byte) []byte {
	if len(p) > 0 {
		b = binary.BigEndian.AppendUint32(b, uint32(len(p)))
		b = append(b, p...)
	}
	return b
}

func appendEnd(b []byte) []byte { return append(b, 0, 0, 0, 0) }

var errShort = errors.New("short frame")

type cursor struct {
	b []byte
	i int
}

func (c *cursor) u16() (int, error) {
	if c.i+2 > len(c.b) {
		return 0, errShort
	}
	v := int(binary.BigEndian.Uint16(c.b[c.i:]))
	c.i += 2
	return v, nil
}

func (c *cursor) str() (string, error) {
	n, err := c.u16()
	if err != nil || c.i+n > len(c.b) {
		return "", errShort
	}
	s := string(c.b[c.i : c.i+n])
	c.i += n
	return s, nil
}

// readHead reads one u32-prefixed head into buf (grown as needed).
func readHead(r *bufio.Reader, buf []byte) ([]byte, error) {
	var n [4]byte
	if _, err := io.ReadFull(r, n[:]); err != nil {
		return buf, err
	}
	size := int(binary.BigEndian.Uint32(n[:]))
	if cap(buf) < size {
		buf = make([]byte, size)
	}
	buf = buf[:size]
	_, err := io.ReadFull(r, buf)
	return buf, err
}

func parseRequestHead(b []byte) (frameRequest, error) {
	c := cursor{b: b}
	var r frameRequest
	var err error
	if r.method, err = c.str(); err != nil {
		return r, err
	}
	if r.target, err = c.str(); err != nil {
		return r, err
	}
	n, err := c.u16()
	if err != nil {
		return r, err
	}
	r.headers = make([]header, n)
	for i := range r.headers {
		if r.headers[i].name, err = c.str(); err != nil {
			return r, err
		}
		if r.headers[i].value, err = c.str(); err != nil {
			return r, err
		}
	}
	return r, nil
}

func parseResponseHead(b []byte) (int, []header, error) {
	c := cursor{b: b}
	status, err := c.u16()
	if err != nil {
		return 0, nil, err
	}
	n, err := c.u16()
	if err != nil {
		return 0, nil, err
	}
	headers := make([]header, n)
	for i := range headers {
		if headers[i].name, err = c.str(); err != nil {
			return 0, nil, err
		}
		if headers[i].value, err = c.str(); err != nil {
			return 0, nil, err
		}
	}
	return status, headers, nil
}

// readBody reads chunks until the empty one and returns the byte count.
func readBody(r *bufio.Reader) (int, error) {
	total := 0
	var n [4]byte
	for {
		if _, err := io.ReadFull(r, n[:]); err != nil {
			return total, err
		}
		size := int(binary.BigEndian.Uint32(n[:]))
		if size == 0 {
			return total, nil
		}
		if _, err := r.Discard(size); err != nil {
			return total, err
		}
		total += size
	}
}
