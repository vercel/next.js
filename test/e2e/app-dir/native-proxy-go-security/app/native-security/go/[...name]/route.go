package main

import (
	"encoding/json"
	"net/http"
)

func GET(w http.ResponseWriter, r *http.Request) {
	name := ParamValues(r, "name")
	json.NewEncoder(w).Encode(map[string]any{
		"name": name, "secret": len(name) > 0 && name[0] == "private",
	})
}
