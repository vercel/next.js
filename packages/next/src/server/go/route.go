//go:build darwin || linux

package main

import (
	"encoding/json"
	"errors"
	"net"
	"net/url"
	"sort"
	"strings"
	"syscall"
	"unicode/utf8"
)

type route struct {
	Path     string `json:"path"`
	Worker   string `json:"worker"`
	Handler  string `json:"handler"`
	segments []string
	backend  int
}
type routeNode struct {
	static                      map[string]*routeNode
	dynamic, catchAll, optional *routeNode
	route                       *route
}
type router struct {
	root                routeNode
	routes              []route
	basePath            string
	assets              map[string]bool
	trailing, skipSlash bool
}

func rank(s string) int {
	if strings.HasPrefix(s, "[[...") {
		return 3
	}
	if strings.HasPrefix(s, "[...") {
		return 2
	}
	if strings.HasPrefix(s, "[") {
		return 1
	}
	return 0
}
func newRouter(m manifest, backends map[string]int) (*router, error) {
	r := &router{basePath: m.BasePath, assets: map[string]bool{}, trailing: m.TrailingSlash, skipSlash: m.SkipTrailingSlash}
	for _, s := range m.PublicAssets {
		r.assets[s] = true
	}
	for _, v := range m.Routes {
		if v.Path != "/" {
			v.segments = strings.Split(strings.Trim(v.Path, "/"), "/")
		}
		if v.Worker != "" {
			var ok bool
			v.backend, ok = backends[v.Worker]
			if !ok {
				return nil, errors.New("unknown route worker")
			}
		}
		r.routes = append(r.routes, v)
	}
	sort.SliceStable(r.routes, func(i, j int) bool {
		a, b := r.routes[i].segments, r.routes[j].segments
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
	for i := range r.routes {
		v := &r.routes[i]
		if len(v.segments) > 128 {
			return nil, errors.New("route depth limit")
		}
		node := &r.root
		for _, part := range v.segments {
			switch rank(part) {
			case 0:
				if node.static == nil {
					node.static = map[string]*routeNode{}
				}
				if node.static[part] == nil {
					node.static[part] = &routeNode{}
				}
				node = node.static[part]
			case 1:
				if node.dynamic == nil {
					node.dynamic = &routeNode{}
				}
				node = node.dynamic
			case 2:
				if node.catchAll == nil {
					node.catchAll = &routeNode{}
				}
				node = node.catchAll
			case 3:
				if node.optional == nil {
					node.optional = &routeNode{}
				}
				node = node.optional
			}
		}
		if node.route != nil {
			return nil, errors.New("ambiguous route inventory")
		}
		node.route = v
	}
	return r, nil
}
func (n *routeNode) lookup(parts []string, at int, budget *int) *route {
	if n == nil || *budget <= 0 {
		return nil
	}
	*budget--
	if at == len(parts) {
		if n.route != nil {
			return n.route
		}
		if n.optional != nil {
			return n.optional.route
		}
		return nil
	}
	if v := n.static[parts[at]].lookup(parts, at+1, budget); v != nil {
		return v
	}
	if v := n.dynamic.lookup(parts, at+1, budget); v != nil {
		return v
	}
	if n.catchAll != nil && n.catchAll.route != nil {
		return n.catchAll.route
	}
	if n.optional != nil {
		return n.optional.route
	}
	return nil
}

func match(segments, parts []string) (map[string][]string, bool) {
	var params map[string][]string
	for i, s := range segments {
		if strings.HasPrefix(s, "[[...") {
			if i > len(parts) {
				return nil, false
			}
			if params == nil {
				params = map[string][]string{}
			}
			params[strings.TrimSuffix(strings.TrimPrefix(s, "[[..."), "]]")] = parts[i:]
			return params, true
		}
		if i >= len(parts) {
			return nil, false
		}
		if strings.HasPrefix(s, "[") {
			if params == nil {
				params = map[string][]string{}
			}
			if strings.HasPrefix(s, "[...") {
				params[strings.TrimSuffix(strings.TrimPrefix(s, "[..."), "]")] = parts[i:]
				return params, true
			}
			params[strings.TrimSuffix(strings.TrimPrefix(s, "["), "]")] = []string{parts[i]}
		} else if s != parts[i] {
			return nil, false
		}
	}
	return params, len(parts) == len(segments)
}
func validTarget(target string) (*url.URL, error) {
	for _, b := range []byte(target) {
		if b < 33 || b > 126 {
			return nil, errors.New("request target must be ASCII escaped")
		}
	}
	if !strings.HasPrefix(target, "/") || strings.HasPrefix(target, "//") || strings.ContainsAny(target, "\\#\r\n\t ") {
		return nil, errors.New("invalid request target")
	}
	u, e := url.ParseRequestURI(target)
	if e != nil || u.Host != "" || u.IsAbs() {
		return nil, errors.New("invalid origin form")
	}
	if strings.Contains(u.EscapedPath(), "//") {
		return nil, errors.New("ambiguous separators")
	}
	if strings.Count(u.EscapedPath(), "/") > 128 {
		return nil, errors.New("path depth limit")
	}
	for _, raw := range strings.Split(u.EscapedPath(), "/") {
		s, e := url.PathUnescape(raw)
		for _, component := range strings.Split(s, "/") {
			if component == "." || component == ".." {
				return nil, errors.New("ambiguous encoded dot segment")
			}
		}
		if !utf8.ValidString(s) {
			return nil, errors.New("invalid UTF-8 path")
		}
		for _, b := range []byte(s) {
			if b < 32 || b == 127 {
				return nil, errors.New("invalid escaped path")
			}
		}
		if e != nil || s == "." || s == ".." || strings.ContainsAny(s, "\\\x00\r\n") {
			return nil, errors.New("ambiguous path")
		}
	}
	return u, nil
}
func (f *frontend) selectRoute(target string) (int, []byte, string, error) {
	u, e := validTarget(target)
	if e != nil {
		return 0, nil, "", e
	}
	r := f.router
	escaped, path := u.EscapedPath(), u.Path
	if r.basePath != "" {
		base := (&url.URL{Path: r.basePath}).EscapedPath()
		if escaped != base && !strings.HasPrefix(escaped, base+"/") {
			return 0, nil, "", nil
		}
		escaped = strings.TrimPrefix(escaped, base)
		path = strings.TrimPrefix(path, r.basePath)
	}
	if strings.HasPrefix(escaped, "/_next/") || r.assets[path] {
		return 0, nil, "", nil
	}
	var parts []string
	if escaped != "" && escaped != "/" {
		for _, raw := range strings.Split(strings.TrimSuffix(strings.TrimPrefix(escaped, "/"), "/"), "/") {
			s, _ := url.PathUnescape(raw)
			parts = append(parts, s)
		}
	}
	budget := 4096
	selected := r.root.lookup(parts, 0, &budget)
	if budget <= 0 {
		return 0, nil, "", errors.New("route lookup budget")
	}
	if selected == nil {
		return 0, nil, "", nil
	}
	v := *selected
	params, ok := match(v.segments, parts)
	if !ok {
		return 0, nil, "", errors.New("route inventory mismatch")
	}
	if v.backend == 0 {
		return 0, nil, "", nil
	}
	if !r.skipSlash && escaped != "" && escaped != "/" && r.trailing != strings.HasSuffix(escaped, "/") {
		target := strings.TrimSuffix(u.EscapedPath(), "/")
		if r.trailing {
			target += "/"
		}
		if u.RawQuery != "" {
			target += "?" + u.RawQuery
		}
		return 0, nil, target, nil
	}
	b, _ := json.Marshal(struct {
		Handler string              `json:"handler"`
		Params  map[string][]string `json:"params"`
	}{v.Handler, params})
	return v.backend, b, "", nil
}
func sockaddrIP(a syscall.Sockaddr) string {
	switch a := a.(type) {
	case *syscall.SockaddrInet4:
		return net.IP(a.Addr[:]).String()
	case *syscall.SockaddrInet6:
		return net.IP(a.Addr[:]).String()
	}
	return ""
}
