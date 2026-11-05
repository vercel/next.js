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
	"strconv"
)

func main() {
	if err := analyze(); err != nil {
		fmt.Fprintln(os.Stderr, err)
		os.Exit(1)
	}
}

func analyze() error {
	var query struct {
		Sources          map[string]string `json:"sources"`
		AssetFiles       []string          `json:"asset_files"`
		AssetPackage     string            `json:"asset_package"`
		AssetPackageName string            `json:"asset_package_name"`
	}
	if err := json.NewDecoder(os.Stdin).Decode(&query); err != nil {
		return err
	}
	sources := query.Sources
	assetFiles := map[string]bool{}
	for _, name := range query.AssetFiles {
		assetFiles[name] = true
	}
	entries := []browserEntry{}
	assetErrors := []string{}
	names := make([]string, 0, len(sources))
	for name := range sources {
		names = append(names, name)
	}
	sort.Strings(names)
	functions := map[string]bool{}
	errors := []string{}
	for _, name := range names {
		positions := token.NewFileSet()
		file, err := parser.ParseFile(positions, name, sources[name], 0)
		if err != nil {
			errors = append(errors, err.Error())
			continue
		}
		if assetFiles[name] {
			discoverBrowser(file, positions, query.AssetPackage, query.AssetPackageName, &entries, &assetErrors)
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
		Functions      []string       `json:"functions"`
		SyntaxErrors   []string       `json:"syntax_errors"`
		BrowserEntries []browserEntry `json:"browser_entries"`
		AssetErrors    []string       `json:"asset_errors"`
	}{declared, errors, entries, assetErrors})
}

type browserEntry struct {
	Path   string `json:"path"`
	File   string `json:"file"`
	Line   int    `json:"line"`
	Column int    `json:"column"`
}

func discoverBrowser(file *ast.File, positions *token.FileSet, sdk string, sdkName string, entries *[]browserEntry, errors *[]string) {
	aliases := map[string]bool{}
	report := func(pos token.Pos, message string) {
		*errors = append(*errors, fmt.Sprintf("%s: %s", positions.Position(pos), message))
	}
	for _, spec := range file.Imports {
		path, err := strconv.Unquote(spec.Path.Value)
		if err != nil || path != sdk {
			continue
		}
		name := sdkName
		if spec.Name != nil {
			name = spec.Name.Name
		}
		if name == "." {
			report(spec.Pos(), "browser assets require a named package import")
			continue
		}
		if name != "_" {
			aliases[name] = true
		}
	}
	isBrowser := func(call *ast.CallExpr) bool {
		selector, ok := call.Fun.(*ast.SelectorExpr)
		if !ok || selector.Sel.Name != "Browser" {
			return false
		}
		ident, ok := selector.X.(*ast.Ident)
		return ok && ident.Obj == nil && aliases[ident.Name]
	}
	direct := map[*ast.CallExpr]bool{}
	for _, declaration := range file.Decls {
		group, ok := declaration.(*ast.GenDecl)
		if !ok || group.Tok != token.VAR {
			continue
		}
		for _, spec := range group.Specs {
			value := spec.(*ast.ValueSpec)
			for _, expr := range value.Values {
				call, ok := expr.(*ast.CallExpr)
				if !ok || !isBrowser(call) {
					continue
				}
				direct[call] = true
				if len(value.Names) != len(value.Values) || len(call.Args) != 1 || call.Ellipsis.IsValid() {
					report(call.Pos(), "Browser requires one string literal in a direct package-level variable initializer")
					continue
				}
				literal, ok := call.Args[0].(*ast.BasicLit)
				if !ok || literal.Kind != token.STRING {
					report(call.Pos(), "Browser requires a string literal; Go expressions are not evaluated")
					continue
				}
				path, err := strconv.Unquote(literal.Value)
				if err != nil {
					report(literal.Pos(), err.Error())
					continue
				}
				position := positions.Position(call.Pos())
				*entries = append(*entries, browserEntry{path, position.Filename, position.Line, position.Column})
			}
		}
	}
	called := map[*ast.SelectorExpr]bool{}
	ast.Inspect(file, func(node ast.Node) bool {
		if call, ok := node.(*ast.CallExpr); ok && isBrowser(call) {
			called[call.Fun.(*ast.SelectorExpr)] = true
			if !direct[call] {
				report(call.Pos(), "Browser must be a direct package-level variable initializer")
			}
		}
		if selector, ok := node.(*ast.SelectorExpr); ok && selector.Sel.Name == "Browser" && !called[selector] {
			if ident, ok := selector.X.(*ast.Ident); ok && ident.Obj == nil && aliases[ident.Name] {
				report(selector.Pos(), "Browser cannot be used indirectly; call it in a direct package-level variable initializer")
			}
		}
		return true
	})
}
