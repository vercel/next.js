package main

import (
	"encoding/json"
	"net/http"
	"os"
)

func GET(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]int{"pid": os.Getpid()})
	if r.URL.Query().Has("stream") {
		w.(http.Flusher).Flush()
		<-r.Context().Done()
	}
}
