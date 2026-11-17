package main

import "net/http"

// GET sends one chunk, then waits until the client goes away.
func GET(w http.ResponseWriter, r *http.Request) {
	w.Write([]byte("first"))
	w.(http.Flusher).Flush()
	<-r.Context().Done()
}
