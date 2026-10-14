package main

import (
	"context"
	"fmt"
	"io"
	"net"
	"net/http"
	"net/http/httputil"
	"net/url"
	"os"
	"os/signal"
	"sort"
	"strings"
	"syscall"
	"time"
	/*IMPORTS*/)

type frontRoute struct {
	path     string
	segments []string
	serve    func(http.ResponseWriter, *http.Request, map[string][]string)
}

var routes = []frontRoute{ /*ROUTES*/ }
var basePath = GO_BASE_PATH
var escapedBasePath = (&url.URL{Path: basePath}).EscapedPath()
var trailingSlash = GO_TRAILING_SLASH
var skipTrailingSlashRedirect = GO_SKIP_TRAILING_SLASH
var publicAssets = map[string]bool{ /*ASSETS*/ }

func rank(segment string) int {
	if strings.HasPrefix(segment, "[[...") {
		return 3
	}
	if strings.HasPrefix(segment, "[...") {
		return 2
	}
	if strings.HasPrefix(segment, "[") {
		return 1
	}
	return 0
}
func match(segments []string, parts []string) (map[string][]string, bool) {
	var params map[string][]string
	for i, segment := range segments {
		if strings.HasPrefix(segment, "[[...") {
			if params == nil {
				params = map[string][]string{}
			}
			params[strings.TrimSuffix(strings.TrimPrefix(segment, "[[..."), "]]")] = parts[i:]
			return params, true
		}
		if i >= len(parts) {
			return nil, false
		}
		if strings.HasPrefix(segment, "[...") {
			if params == nil {
				params = map[string][]string{}
			}
			params[strings.TrimSuffix(strings.TrimPrefix(segment, "[..."), "]")] = parts[i:]
			return params, true
		}
		if strings.HasPrefix(segment, "[") {
			if params == nil {
				params = map[string][]string{}
			}
			params[strings.TrimSuffix(strings.TrimPrefix(segment, "["), "]")] = []string{parts[i]}
		} else if segment != parts[i] {
			return nil, false
		}
	}
	return params, len(parts) == len(segments)
}

func main() {
	token := os.Getenv("__NEXT_GO_TOKEN")
	upstream, err := url.Parse(os.Getenv("__NEXT_GO_UPSTREAM"))
	if err != nil || upstream.Scheme != "http" || token == "" {
		panic("Go frontend must be started by Next.js")
	}
	listener, err := net.Listen("tcp", os.Getenv("__NEXT_GO_LISTEN"))
	if err != nil {
		panic(err)
	}
	for i := range routes {
		if routes[i].path != "/" {
			routes[i].segments = strings.Split(strings.Trim(routes[i].path, "/"), "/")
		}
	}
	sort.SliceStable(routes, func(i, j int) bool {
		a, b := routes[i].segments, routes[j].segments
		for k := 0; k < len(a) && k < len(b); k++ {
			if rank(a[k]) != rank(b[k]) {
				return rank(a[k]) < rank(b[k])
			}
			if a[k] != b[k] {
				return a[k] < b[k]
			}
		}
		return len(a) > len(b)
	})
	proxy := &httputil.ReverseProxy{
		Rewrite: func(p *httputil.ProxyRequest) {
			p.Out.URL.Scheme, p.Out.URL.Host = upstream.Scheme, upstream.Host
			p.Out.URL.RawQuery = p.In.URL.RawQuery
			p.Out.Host = p.In.Host
			p.SetXForwarded()
			for _, name := range []string{"Forwarded", "X-Forwarded-For", "X-Forwarded-Host", "X-Forwarded-Proto"} {
				if values, ok := p.In.Header[name]; ok {
					p.Out.Header[name] = values
				}
			}
			p.Out.Header.Set("X-Next-Go-Upstream-Token", token)
		},
		Transport:     &http.Transport{MaxIdleConns: 256, MaxIdleConnsPerHost: 256, IdleConnTimeout: 90 * time.Second},
		FlushInterval: -1,
	}
	server := &http.Server{Handler: http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		for name := range r.Header {
			if strings.HasPrefix(strings.ToLower(name), "x-next-go-") {
				r.Header.Del(name)
			}
		}
		path := r.URL.EscapedPath()
		assetPath := r.URL.Path
		if basePath != "" {
			if path != escapedBasePath && !strings.HasPrefix(path, escapedBasePath+"/") {
				proxy.ServeHTTP(w, r)
				return
			}
			path = strings.TrimPrefix(path, escapedBasePath)
			assetPath = strings.TrimPrefix(assetPath, basePath)
		}
		if strings.HasPrefix(path, "/_next/") || publicAssets[assetPath] {
			proxy.ServeHTTP(w, r)
			return
		}
		var parts []string
		if path != "" && path != "/" {
			for _, part := range strings.Split(strings.TrimSuffix(strings.TrimPrefix(path, "/"), "/"), "/") {
				decoded, err := url.PathUnescape(part)
				if err != nil {
					http.Error(w, "Invalid URL", http.StatusBadRequest)
					return
				}
				parts = append(parts, decoded)
			}
		}
		for _, route := range routes {
			params, ok := match(route.segments, parts)
			if !ok {
				continue
			}
			if route.serve == nil {
				break
			}
			if !skipTrailingSlashRedirect && path != "" && path != "/" && trailingSlash != strings.HasSuffix(path, "/") {
				target := strings.TrimSuffix(r.URL.EscapedPath(), "/")
				if trailingSlash {
					target += "/"
				}
				if r.URL.RawQuery != "" {
					target += "?" + r.URL.RawQuery
				}
				http.Redirect(w, r, target, http.StatusPermanentRedirect)
				return
			}
			defer func() {
				if recovered := recover(); recovered != nil {
					fmt.Fprintln(os.Stderr, "native route panic:", recovered)
					panic(http.ErrAbortHandler)
				}
			}()
			route.serve(w, r, params)
			return
		}
		proxy.ServeHTTP(w, r)
	})}
	done := make(chan struct{})
	go func() {
		defer close(done)
		parentDone := make(chan struct{})
		go func() { _, _ = io.Copy(io.Discard, os.Stdin); close(parentDone) }()
		signals := make(chan os.Signal, 1)
		signal.Notify(signals, os.Interrupt, syscall.SIGTERM)
		defer signal.Stop(signals)
		select {
		case <-parentDone:
		case <-signals:
		}
		ctx, cancel := context.WithTimeout(context.Background(), 20*time.Second)
		defer cancel()
		_ = server.Shutdown(ctx)
	}()
	fmt.Fprintf(os.Stdout, "\x1eNEXT_GO_READY:%s:%d\n", token, listener.Addr().(*net.TCPAddr).Port)
	if err := server.Serve(listener); err != nil && err != http.ErrServerClosed {
		panic(err)
	}
	<-done
}
