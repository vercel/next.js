package main

import "net/http"

func GET(w http.ResponseWriter, r *http.Request) {
	writeMethod(w, "GET")
}

func POST(w http.ResponseWriter, r *http.Request) {
	writeMethod(w, "POST")
}

func PUT(w http.ResponseWriter, r *http.Request) {
	writeMethod(w, "PUT")
}

func PATCH(w http.ResponseWriter, r *http.Request) {
	writeMethod(w, "PATCH")
}

func DELETE(w http.ResponseWriter, r *http.Request) {
	writeMethod(w, "DELETE")
}

func writeMethod(w http.ResponseWriter, method string) {
	w.Header().Set("X-Handled-By", method)
	w.Write([]byte(method))
}
