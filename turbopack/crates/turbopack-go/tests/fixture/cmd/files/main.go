package main

import (
	"embed"
	"encoding/json"
	"fmt"
	"os"

	"example.com/native-fixture/internal/helper"
)

//go:embed assets/*
var assets embed.FS

func main() {
	data, err := assets.ReadFile("assets/message.txt")
	if err != nil {
		panic(err)
	}
	json.NewEncoder(os.Stdout).Encode(map[string]string{
		"body": fmt.Sprintf("%s:%s:%s", value(), helper.Message(), data),
	})
}
