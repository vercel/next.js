// tbench measures the transport between two local processes: HTTP/1.1 or a
// length-prefixed framing, over loopback TCP or a Unix socket.
//
//	tbench server -proto http|framed -net tcp|unix [-addr path] -size N
//	tbench client -proto http|framed -net tcp|unix -addr A -c C -d 5s -warmup 1s
//
// The server prints "READY <addr>", and "STATS <requests> <cpu_us>" when its
// stdin closes. A request for /__reset zeroes the server's counters, so the
// client can leave its warmup out of the server's numbers.
package main

import (
	"bufio"
	"context"
	"encoding/json"
	"flag"
	"fmt"
	"io"
	"net"
	"net/http"
	"os"
	"sort"
	"strconv"
	"sync"
	"sync/atomic"
	"syscall"
	"time"
)

func cpuMicros() int64 {
	var ru syscall.Rusage
	_ = syscall.Getrusage(syscall.RUSAGE_SELF, &ru)
	return ru.Utime.Sec*1e6 + int64(ru.Utime.Usec) + ru.Stime.Sec*1e6 + int64(ru.Stime.Usec)
}

func main() {
	if len(os.Args) < 2 {
		fmt.Fprintln(os.Stderr, "usage: tbench server|client ...")
		os.Exit(2)
	}
	switch os.Args[1] {
	case "server":
		server(os.Args[2:])
	case "client":
		client(os.Args[2:])
	default:
		os.Exit(2)
	}
}

type counters struct {
	requests atomic.Int64
	cpuStart atomic.Int64
}

func (c *counters) reset() {
	c.requests.Store(0)
	c.cpuStart.Store(cpuMicros())
}

func server(args []string) {
	fs := flag.NewFlagSet("server", flag.ExitOnError)
	proto := fs.String("proto", "http", "")
	network := fs.String("net", "tcp", "")
	addr := fs.String("addr", "", "")
	size := fs.Int("size", 13, "")
	sockbuf := fs.Int("sockbuf", 0, "if set, SO_SNDBUF/SO_RCVBUF for Unix connections")
	_ = fs.Parse(args)

	listenAddr := "127.0.0.1:0"
	if *network == "unix" {
		listenAddr = *addr
		_ = os.Remove(listenAddr)
	}
	ln, err := net.Listen(*network, listenAddr)
	if err != nil {
		panic(err)
	}
	if *sockbuf > 0 {
		ln = bufListener{ln, *sockbuf}
	}
	payload := body(*size)
	var stats counters
	stats.reset()

	go func() {
		_, _ = io.Copy(io.Discard, os.Stdin)
		fmt.Printf("STATS %d %d\n", stats.requests.Load(), cpuMicros()-stats.cpuStart.Load())
		os.Exit(0)
	}()
	fmt.Printf("READY %s\n", ln.Addr().String())

	if *proto == "http" {
		contentLength := strconv.Itoa(len(payload))
		srv := &http.Server{Handler: http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			if r.URL.Path == "/__reset" {
				stats.reset()
				return
			}
			stats.requests.Add(1)
			h := w.Header()
			for _, kv := range responseHeaders {
				h[http.CanonicalHeaderKey(kv.name)] = []string{kv.value}
			}
			h["Content-Length"] = []string{contentLength}
			w.WriteHeader(200)
			_, _ = w.Write(payload)
		})}
		_ = srv.Serve(ln)
		return
	}
	for {
		conn, err := ln.Accept()
		if err != nil {
			panic(err)
		}
		go serveFramed(conn, payload, &stats)
	}
}

func serveFramed(conn net.Conn, payload []byte, stats *counters) {
	defer conn.Close()
	r := bufio.NewReaderSize(conn, 64<<10)
	w := bufio.NewWriterSize(conn, 64<<10)
	var head, out []byte
	for {
		var err error
		head, err = readHead(r, head)
		if err != nil {
			return
		}
		req, err := parseRequestHead(head)
		if err != nil {
			return
		}
		if _, err := readBody(r); err != nil {
			return
		}
		if req.target == "/__reset" {
			stats.reset()
		} else {
			stats.requests.Add(1)
		}
		out = appendResponseHead(out[:0], 200, responseHeaders)
		out = appendChunk(out, payload)
		out = appendEnd(out)
		if _, err := w.Write(out); err != nil {
			return
		}
		if err := w.Flush(); err != nil {
			return
		}
	}
}

type result struct {
	Requests        int64   `json:"requests"`
	RPS             float64 `json:"rps"`
	P50us           float64 `json:"p50_us"`
	P99us           float64 `json:"p99_us"`
	ClientCPUPerReq float64 `json:"client_cpu_us_per_req"`
}

func client(args []string) {
	fs := flag.NewFlagSet("client", flag.ExitOnError)
	proto := fs.String("proto", "http", "")
	network := fs.String("net", "tcp", "")
	addr := fs.String("addr", "", "")
	conc := fs.Int("c", 1, "")
	sockbuf := fs.Int("sockbuf", 0, "")
	dur := fs.Duration("d", 5*time.Second, "")
	warmup := fs.Duration("warmup", time.Second, "")
	_ = fs.Parse(args)

	var do func(worker int, target string) error
	if *proto == "http" {
		transport := &http.Transport{
			MaxIdleConnsPerHost: *conc + 1,
			MaxConnsPerHost:     *conc + 1,
			DisableCompression:  true,
			DialContext: func(ctx context.Context, _, _ string) (net.Conn, error) {
				var d net.Dialer
				c, err := d.DialContext(ctx, *network, *addr)
				if err == nil {
					setBuf(c, *sockbuf)
				}
				return c, err
			},
		}
		hc := &http.Client{Transport: transport}
		do = func(_ int, target string) error {
			req, _ := http.NewRequest("GET", "http://upstream"+target, nil)
			for _, h := range requestHeaders {
				if h.name == "host" {
					req.Host = h.value
					continue
				}
				req.Header[http.CanonicalHeaderKey(h.name)] = []string{h.value}
			}
			res, err := hc.Do(req)
			if err != nil {
				return err
			}
			_, err = io.Copy(io.Discard, res.Body)
			res.Body.Close()
			return err
		}
	} else {
		type fconn struct {
			c   net.Conn
			r   *bufio.Reader
			out []byte
			buf []byte
		}
		conns := make([]*fconn, *conc+1)
		for i := range conns {
			c, err := net.Dial(*network, *addr)
			if err != nil {
				panic(err)
			}
			setBuf(c, *sockbuf)
			conns[i] = &fconn{c: c, r: bufio.NewReaderSize(c, 64<<10)}
		}
		do = func(worker int, target string) error {
			fc := conns[worker]
			req := frameRequest{method: "GET", target: target, headers: requestHeaders}
			fc.out = appendEnd(appendRequestHead(fc.out[:0], &req))
			if _, err := fc.c.Write(fc.out); err != nil {
				return err
			}
			var err error
			fc.buf, err = readHead(fc.r, fc.buf)
			if err != nil {
				return err
			}
			if _, _, err := parseResponseHead(fc.buf); err != nil {
				return err
			}
			_, err = readBody(fc.r)
			return err
		}
	}

	run := func(d time.Duration, record bool) ([][]time.Duration, int64) {
		lat := make([][]time.Duration, *conc)
		var total atomic.Int64
		deadline := time.Now().Add(d)
		var wg sync.WaitGroup
		for i := 0; i < *conc; i++ {
			wg.Add(1)
			go func(i int) {
				defer wg.Done()
				for time.Now().Before(deadline) {
					t := time.Now()
					if err := do(i, requestTarget); err != nil {
						panic(err)
					}
					if record {
						lat[i] = append(lat[i], time.Since(t))
					}
					total.Add(1)
				}
			}(i)
		}
		wg.Wait()
		return lat, total.Load()
	}

	run(*warmup, false)
	if err := do(*conc, "/__reset"); err != nil {
		panic(err)
	}
	cpu0 := cpuMicros()
	t0 := time.Now()
	lat, n := run(*dur, true)
	elapsed := time.Since(t0)
	cpu := cpuMicros() - cpu0

	var all []time.Duration
	for _, l := range lat {
		all = append(all, l...)
	}
	sort.Slice(all, func(i, j int) bool { return all[i] < all[j] })
	pct := func(p float64) float64 {
		return float64(all[int(float64(len(all)-1)*p)].Nanoseconds()) / 1e3
	}
	_ = json.NewEncoder(os.Stdout).Encode(result{
		Requests:        n,
		RPS:             float64(n) / elapsed.Seconds(),
		P50us:           pct(0.5),
		P99us:           pct(0.99),
		ClientCPUPerReq: float64(cpu) / float64(n),
	})
}

// bufListener sets socket buffer sizes on accepted Unix connections. macOS
// defaults them to 8 KiB (net.local.stream.sendspace/recvspace).
type bufListener struct {
	net.Listener
	size int
}

func (l bufListener) Accept() (net.Conn, error) {
	c, err := l.Listener.Accept()
	if err == nil {
		setBuf(c, l.size)
	}
	return c, err
}

func setBuf(c net.Conn, size int) {
	if u, ok := c.(*net.UnixConn); ok && size > 0 {
		_ = u.SetWriteBuffer(size)
		_ = u.SetReadBuffer(size)
	}
}
