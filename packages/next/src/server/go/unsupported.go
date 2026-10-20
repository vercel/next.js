//go:build !linux && !darwin

package main

import (
	"fmt"
	"os"
)

func main() {
	fmt.Fprintln(os.Stderr, "experimental.goServer supports Linux and macOS only")
	os.Exit(1)
}
