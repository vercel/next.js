package main

import (
	"bufio"
	"encoding/json"
	"errors"
	"io"
)

// controlMessage is one line Node writes to Switchyard's stdin
// (packages/next/src/server/lib/switchyard.ts):
//
//	{"event":"table","table":{...}}      the route table, once the router loaded
//	{"event":"worker","page":"/api/users/[id]/route",
//	 "address":"127.0.0.1:51300","tokenHeader":"x-next-internal-go-token",
//	 "token":"…"}                         a route.go worker is ready for a page
//	{"event":"gone","address":"127.0.0.1:51300"}
//	                                      that worker takes no new requests
type controlMessage struct {
	Event       string          `json:"event"`
	Table       json.RawMessage `json:"table"`
	Page        string          `json:"page"`
	Address     string          `json:"address"`
	TokenHeader string          `json:"tokenHeader"`
	Token       string          `json:"token"`
}

// readControl calls apply for each line on r until r ends. A line that isn't
// a message is reported and skipped, so one bad line can't stop Switchyard.
func readControl(r io.Reader, apply func(controlMessage), report func(error)) {
	lines := bufio.NewReader(r)
	for {
		// ReadBytes has no line-length limit: the table can be large.
		line, err := lines.ReadBytes('\n')
		if len(line) > 0 {
			var msg controlMessage
			if jsonErr := json.Unmarshal(line, &msg); jsonErr != nil {
				report(jsonErr)
			} else {
				apply(msg)
			}
		}
		if err != nil {
			if !errors.Is(err, io.EOF) {
				report(err)
			}
			return
		}
	}
}
