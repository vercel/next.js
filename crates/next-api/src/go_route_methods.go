// This build-time tool parses tracked source bytes; it never loads or executes a route.
package main

import (
	"encoding/json"
	"fmt"
	"go/ast"
	"go/parser"
	"go/token"
	"os"
	"sort"
)

func main() {
	if err := discover(); err != nil {
		fmt.Fprintln(os.Stderr, err)
		os.Exit(1)
	}
}

func discover() error {
	input, err := os.Open(os.Args[1])
	if err != nil {
		return err
	}
	defer input.Close()
	var sources map[string]string
	if err := json.NewDecoder(input).Decode(&sources); err != nil {
		return err
	}
	names := make([]string, 0, len(sources))
	for name := range sources {
		names = append(names, name)
	}
	sort.Strings(names)
	methods := map[string]bool{}
	for _, name := range names {
		file, err := parser.ParseFile(token.NewFileSet(), name, sources[name], parser.SkipObjectResolution)
		if err != nil {
			// Let the route compiler report syntax errors with its normal diagnostics.
			continue
		}
		for _, declaration := range file.Decls {
			function, ok := declaration.(*ast.FuncDecl)
			if !ok || function.Recv != nil {
				continue
			}
			switch function.Name.Name {
			case "GET", "HEAD", "POST", "PUT", "DELETE", "PATCH", "OPTIONS":
				methods[function.Name.Name] = true
			}
		}
	}
	declared := make([]string, 0, len(methods))
	for method := range methods {
		declared = append(declared, method)
	}
	sort.Strings(declared)
	return json.NewEncoder(os.Stdout).Encode(declared)
}
