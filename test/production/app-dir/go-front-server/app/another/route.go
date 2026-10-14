package main

import (
	"encoding/json"
	"net/http"
	"os"
)

var Methods = []string{"GET"}

func Handle(w http.ResponseWriter, r *http.Request) {
	json.NewEncoder(w).Encode(map[string]int{"pid": os.Getpid()})
}
