package routing

import (
	"go/parser"
	"go/token"
	"path/filepath"
	"strconv"
	"strings"
	"testing"
)

// TestNoNetworkImports keeps this package free of HTTP and network code, so
// hosts other than next-front can use it with their own HTTP handling.
func TestNoNetworkImports(t *testing.T) {
	files, err := filepath.Glob("*.go")
	if err != nil {
		t.Fatal(err)
	}
	for _, file := range files {
		if strings.HasSuffix(file, "_test.go") {
			continue
		}
		f, err := parser.ParseFile(token.NewFileSet(), file, nil, parser.ImportsOnly)
		if err != nil {
			t.Fatal(err)
		}
		for _, spec := range f.Imports {
			path, _ := strconv.Unquote(spec.Path.Value)
			if path == "net" || strings.HasPrefix(path, "net/") || path == "os" {
				t.Errorf("%s imports %s", file, path)
			}
		}
	}
}
