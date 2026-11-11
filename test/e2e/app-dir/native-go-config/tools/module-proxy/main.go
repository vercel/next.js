// Test-only module proxy: serves the exact SDK sources shipped in the packed next package.
package main

import (
	"archive/zip"
	"fmt"
	"os"
	"path/filepath"
)

func run() error {
	sdk, proxy := os.Args[1], os.Args[2]
	const module = "github.com/vercel/next.js/packages/next/go"
	const version = "v0.0.0"
	dir := filepath.Join(proxy, filepath.FromSlash(module), "@v")
	if err := os.MkdirAll(dir, 0755); err != nil {
		return err
	}
	mod, err := os.ReadFile(filepath.Join(sdk, "go.mod"))
	if err != nil {
		return err
	}
	if err := os.WriteFile(filepath.Join(dir, version+".mod"), mod, 0644); err != nil {
		return err
	}
	if err := os.WriteFile(filepath.Join(dir, version+".info"), []byte(`{"Version":"v0.0.0","Time":"2000-01-01T00:00:00Z"}`), 0644); err != nil {
		return err
	}
	file, err := os.Create(filepath.Join(dir, version+".zip"))
	if err != nil {
		return err
	}
	defer file.Close()
	archive := zip.NewWriter(file)
	for _, name := range []string{"go.mod", "config.go"} {
		content, err := os.ReadFile(filepath.Join(sdk, name))
		if err != nil {
			return err
		}
		entry, err := archive.Create(module + "@" + version + "/" + name)
		if err != nil {
			return err
		}
		if _, err := entry.Write(content); err != nil {
			return err
		}
	}
	return archive.Close()
}

func main() {
	if err := run(); err != nil {
		fmt.Fprintln(os.Stderr, err)
		os.Exit(1)
	}
}
