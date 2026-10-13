package main

import (
	"encoding/json"
	"net/http"
)

var Methods = []string{"GET"}

func Handle(w http.ResponseWriter, r *http.Request) {
	json.NewEncoder(w).Encode(ParamValues(r, "slug"))
}
