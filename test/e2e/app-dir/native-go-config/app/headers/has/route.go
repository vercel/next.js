package route

import (
	"net/http"
	"strings"
)

func GET(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("x-unrelated-values", strings.Join(r.Header.Values("X-Unrelated"), "|"))
	resource := r.Header.Get("X-Resource")
	if resource == "" {
		resource = r.Header.Get("Set-Cookie")
	}
	if resource == "private" {
		w.Write([]byte("secret"))
		return
	}
	w.Write([]byte("public"))
}
