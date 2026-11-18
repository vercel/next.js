package main

import (
	"encoding/json"
	"fmt"
	"io"
	"net/http"
)

func GET(w http.ResponseWriter, r *http.Request) {
	fmt.Fprintf(w, "native handler: %s", r.Header.Get("x-from-go"))
}

func receiveBody(w http.ResponseWriter, r *http.Request) {
	body, err := io.ReadAll(r.Body)
	if err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]string{"method": r.Method, "body": string(body)})
}

func POST(w http.ResponseWriter, r *http.Request)    { receiveBody(w, r) }
func PUT(w http.ResponseWriter, r *http.Request)     { receiveBody(w, r) }
func PATCH(w http.ResponseWriter, r *http.Request)   { receiveBody(w, r) }
func DELETE(w http.ResponseWriter, r *http.Request)  { receiveBody(w, r) }
func OPTIONS(w http.ResponseWriter, r *http.Request) { receiveBody(w, r) }
