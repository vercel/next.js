package main

import (
	"encoding/json"
	"net/http"
)

func GET(w http.ResponseWriter, r *http.Request) {
	json.NewEncoder(w).Encode(ParamValues(r, "slug"))
}
