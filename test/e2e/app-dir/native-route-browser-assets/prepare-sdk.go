// Prepare the real SDK source as a versioned module on an isolated file proxy.
// This helper is test infrastructure, not application discovery or route code.
package main

import (
	"archive/zip"
	"fmt"
	"io"
	"io/fs"
	"os"
	"path/filepath"
	"strings"
)

func main() {
	if err := prepare(); err != nil {
		panic(err)
	}
}

func prepare() error {
	if len(os.Args) != 3 {
		return fmt.Errorf("usage: prepare-sdk SDK_SOURCE PROXY")
	}
	const module = "github.com/vercel/next.js/packages/next-go"
	const version = "v0.0.0"
	source, proxy := os.Args[1], os.Args[2]
	output := filepath.Join(proxy, module, "@v")
	if err := os.MkdirAll(output, 0755); err != nil {
		return err
	}
	mod, err := os.ReadFile(filepath.Join(source, "go.mod"))
	if err != nil {
		return err
	}
	if err := os.WriteFile(filepath.Join(output, version+".mod"), mod, 0644); err != nil {
		return err
	}
	if err := os.WriteFile(filepath.Join(output, version+".info"), []byte(`{"Version":"v0.0.0","Time":"2026-01-01T00:00:00Z"}`), 0644); err != nil {
		return err
	}
	file, err := os.Create(filepath.Join(output, version+".zip"))
	if err != nil {
		return err
	}
	defer file.Close()
	archive := zip.NewWriter(file)
	if err := filepath.WalkDir(source, func(path string, entry fs.DirEntry, walkErr error) error {
		if walkErr != nil {
			return walkErr
		}
		if !entry.Type().IsRegular() || strings.HasSuffix(path, "_test.go") {
			return nil
		}
		relative, err := filepath.Rel(source, path)
		if err != nil {
			return err
		}
		destination, err := archive.Create(module + "@" + version + "/" + filepath.ToSlash(relative))
		if err != nil {
			return err
		}
		data, err := os.Open(path)
		if err != nil {
			return err
		}
		defer data.Close()
		_, err = io.Copy(destination, data)
		return err
	}); err != nil {
		return err
	}
	return archive.Close()
}
