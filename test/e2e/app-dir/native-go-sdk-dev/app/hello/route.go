package route

import (
	"net/http"

	"example.com/sdkdev/internal/greet"
)

func GET(w http.ResponseWriter, r *http.Request) {
	w.Write([]byte(greet.Message()))
}
