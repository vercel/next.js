// This build-time tool only parses source bytes. It never loads application code.
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
	if err := analyze(); err != nil {
		fmt.Fprintln(os.Stderr, err)
		os.Exit(1)
	}
}

func analyze() error {
	var sources map[string]string
	if err := json.NewDecoder(os.Stdin).Decode(&sources); err != nil {
		return err
	}
	names := make([]string, 0, len(sources))
	for name := range sources {
		names = append(names, name)
	}
	sort.Strings(names)
	functions := map[string]bool{}
	errors := []string{}
	for _, name := range names {
		file, err := parser.ParseFile(token.NewFileSet(), name, sources[name], parser.SkipObjectResolution)
		if err != nil {
			errors = append(errors, err.Error())
			continue
		}
		// Include unexported package functions too; callers decide which names have meaning.
		for _, declaration := range file.Decls {
			if function, ok := declaration.(*ast.FuncDecl); ok && function.Recv == nil {
				functions[function.Name.Name] = true
			}
		}
	}
	declared := make([]string, 0, len(functions))
	for name := range functions {
		declared = append(declared, name)
	}
	sort.Strings(declared)
	return json.NewEncoder(os.Stdout).Encode(struct {
		Functions    []string `json:"functions"`
		SyntaxErrors []string `json:"syntax_errors"`
	}{declared, errors})
}
