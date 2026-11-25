package route

import (
	"net/http"

	"example.com/native-route/app/internal/visibility"
)

// Fails to compile unless this package may import app/internal packages.
var _ = visibility.Name

func sibling() string { return "sibling-v1" }

func POST(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("X-Handled-By", "POST")
	serveNative(w, r)
}
