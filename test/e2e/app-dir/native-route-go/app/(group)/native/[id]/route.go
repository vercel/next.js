package main

import (
	"embed"
	"encoding/json"
	"example.com/native-route/internal/message"
	"io"
	"net/http"
	"os"
	"strings"
)

//go:embed assets/*
var assets embed.FS
var Methods = []string{"GET", "POST"}

func Handle(w http.ResponseWriter, r *http.Request) {
	if r.URL.Query().Get("crash") == "1" {
		os.Exit(2)
	}
	if r.URL.Query().Get("stream") == "1" {
		w.Write([]byte("first"))
		w.(http.Flusher).Flush()
		<-r.Context().Done()
		return
	}
	body, _ := io.ReadAll(r.Body)
	asset, _ := assets.ReadFile("assets/message.txt")
	entries, _ := assets.ReadDir("assets")
	w.Header().Set("Content-Type", "application/json")
	w.Header().Add("Set-Cookie", "first=1; Path=/")
	w.Header().Add("Set-Cookie", "second=2; Path=/")
	w.Header().Set("X-Native-Route", "yes")
	w.WriteHeader(201)
	json.NewEncoder(w).Encode(map[string]any{
		"id": r.PathValue("id"), "method": r.Method, "query": r.URL.RawQuery,
		"body": string(body), "sibling": sibling(), "dependency": message.Text(),
		"embedded": strings.TrimSpace(string(asset)), "assetCount": len(entries),
		"proxy": r.Header.Get("X-Proxy-Count"), "pid": os.Getpid(),
		"repeated": r.Header.Values("X-Repeated"),
		"path":     r.URL.EscapedPath(), "requestURI": r.RequestURI,
		"routingHeader": r.Header.Get("X-Test-Go-Routing-Path"),
	})
}
