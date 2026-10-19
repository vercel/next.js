package main

import (
	"encoding/json"
	"io"
	"net/http"
	"os"
)

var Methods = []string{"GET", "POST"}

func Handle(w http.ResponseWriter, r *http.Request) {
	switch r.PathValue("id") {
	case "stream":
		w.Header().Set("Trailer", "X-Finished")
		w.Write([]byte("first"))
		w.(http.Flusher).Flush()
		w.Write([]byte("second"))
		w.Header().Set("X-Finished", "yes")
		return
	case "cancel":
		w.Write([]byte("first"))
		w.(http.Flusher).Flush()
		<-r.Context().Done()
		os.WriteFile("cancelled", []byte("yes"), 0600)
		return
	case "exit":
		os.Exit(3)
	case "upgrade":
		c, b, e := w.(http.Hijacker).Hijack()
		if e != nil {
			return
		}
		defer c.Close()
		b.WriteString("HTTP/1.1 101 Switching Protocols\r\nConnection: Upgrade\r\nUpgrade: echo\r\n\r\n")
		b.Flush()
		io.Copy(c, b)
		return
	}
	body, _ := io.ReadAll(r.Body)
	w.Header().Add("Set-Cookie", "one=1")
	w.Header().Add("Set-Cookie", "two=2")
	json.NewEncoder(w).Encode(map[string]any{"pid": os.Getpid(), "frontendPid": os.Getppid(), "id": r.PathValue("id"), "remote": r.RemoteAddr, "body": string(body), "trailers": r.Trailer, "headers": r.Header})
}
