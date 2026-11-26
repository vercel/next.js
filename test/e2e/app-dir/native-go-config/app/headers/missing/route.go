package route

import "net/http"

func GET(w http.ResponseWriter, r *http.Request) {
	if r.Header.Get("X-Resource") == "" {
		w.Write([]byte("secret"))
		return
	}
	w.Write([]byte("public"))
}
