package main

import (
	"net/http"

	"example.com/switchyard-go/internal/echo"
)

func GET(w http.ResponseWriter, r *http.Request)  { echo.Serve(w, r) }
func POST(w http.ResponseWriter, r *http.Request) { echo.Serve(w, r) }
