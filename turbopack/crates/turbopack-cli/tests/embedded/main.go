package main

import (
	"crypto/sha256"
	_ "embed"
	"fmt"
	"time"
	_ "time/tzdata"

	"example.com/embedded/internal/message"
)

//go:embed asset.txt
var asset string

func main() {
	location, err := time.LoadLocation("Asia/Tokyo")
	if err != nil {
		panic(err)
	}
	fmt.Printf("%s %x %s %s", message.Value(), sha256.Sum256([]byte("embedded")), location, asset)
}
