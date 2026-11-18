package main

import (
	"net/http"

	"example.com/front-server-go/internal/echo"
)

func GET(w http.ResponseWriter, r *http.Request) { echo.Serve(w, r, "path") }
