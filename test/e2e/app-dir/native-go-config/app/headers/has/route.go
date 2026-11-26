package route

import "net/http"

func GET(w http.ResponseWriter, r *http.Request) {
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
