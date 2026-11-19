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

// node describes initializer syntax without evaluating it. Composite literals, string
// and integer literals and true/false are structural; every other expression is
// "unsupported". Consumers decide which shapes have meaning.
type node map[string]any

type importSpec struct {
	// Name is the explicit import name, or empty when the package clause name applies.
	Name string `json:"name"`
	Path string `json:"path"`
}

type value struct {
	Pos      string       `json:"pos"`
	Constant bool         `json:"constant"`
	Imports  []importSpec `json:"imports"`
	Value    node         `json:"value"`
}

type file struct {
	positions *token.FileSet
}

func (f file) pos(n ast.Node) string {
	return f.positions.Position(n.Pos()).String()
}

func (f file) unsupported(n ast.Node) node {
	return node{"kind": "unsupported", "pos": f.pos(n)}
}

// typeName renders a literal's type as written, such as "[]pkg.Name". Qualifiers are not
// resolved because unnamed imports use the imported package clause, which is not loaded.
func typeName(expr ast.Expr) string {
	switch t := expr.(type) {
	case *ast.Ident:
		return t.Name
	case *ast.SelectorExpr:
		if qualifier, ok := t.X.(*ast.Ident); ok {
			return qualifier.Name + "." + t.Sel.Name
		}
	case *ast.ArrayType:
		if t.Len == nil {
			if element := typeName(t.Elt); element != "" {
				return "[]" + element
			}
		}
	}
	return ""
}

func (f file) describe(expr ast.Expr) node {
	switch e := expr.(type) {
	case *ast.BasicLit:
		switch e.Kind {
		case token.STRING:
			if v, err := strconv.Unquote(e.Value); err == nil {
				return node{"kind": "string", "pos": f.pos(e), "value": v}
			}
		case token.INT:
			if v, err := strconv.ParseInt(e.Value, 0, 64); err == nil {
				return node{"kind": "int", "pos": f.pos(e), "value": v}
			}
		}
	case *ast.Ident:
		if e.Name == "true" || e.Name == "false" {
			return node{"kind": "bool", "pos": f.pos(e), "value": e.Name == "true"}
		}
	case *ast.CompositeLit:
		var literalType any
		if e.Type != nil {
			name := typeName(e.Type)
			if name == "" {
				break
			}
			literalType = name
		}
		elements := []node{}
		for _, element := range e.Elts {
			field, ok := element.(*ast.KeyValueExpr)
			if !ok {
				elements = append(elements, node{"value": f.describe(element)})
				continue
			}
			key, ok := field.Key.(*ast.Ident)
			if !ok {
				// Index and map keys are not field names.
				elements = append(elements, node{"value": f.unsupported(field.Key)})
				continue
			}
			elements = append(elements, node{"key": key.Name, "value": f.describe(field.Value)})
		}
		return node{"kind": "composite", "pos": f.pos(e), "type": literalType, "elements": elements}
	}
	return f.unsupported(expr)
}

func analyze() error {
	// Only the files the caller asked to analyze are sent; other package files are not parsed.
	var query struct {
		Sources map[string]string `json:"sources"`
		// AssetPackage enables Browser discovery for that SDK import path, whose package
		// clause is AssetPackageName.
		AssetPackage     string `json:"asset_package"`
		AssetPackageName string `json:"asset_package_name"`
	}
	if err := json.NewDecoder(os.Stdin).Decode(&query); err != nil {
		return err
	}
	sources := query.Sources
	entries := []browserEntry{}
	assetErrors := []string{}
	names := make([]string, 0, len(sources))
	for name := range sources {
		names = append(names, name)
	}
	sort.Strings(names)
	functions := map[string]bool{}
	values := map[string]string{}
	errors := []string{}
	for _, name := range names {
		positions := token.NewFileSet()
		// Object resolution lets Browser discovery ignore local identifiers that shadow imports.
		parsed, err := parser.ParseFile(positions, name, sources[name], 0)
		if err != nil {
			errors = append(errors, err.Error())
			continue
		}
		if query.AssetPackage != "" {
			discoverBrowser(parsed, positions, query.AssetPackage, query.AssetPackageName, &entries, &assetErrors)
		}
		f := file{positions}
		imports := []importSpec{}
		for _, spec := range parsed.Imports {
			path, err := strconv.Unquote(spec.Path.Value)
			if err != nil {
				continue
			}
			imported := importSpec{Path: path}
			if spec.Name != nil {
				imported.Name = spec.Name.Name
			}
			imports = append(imports, imported)
		}
		for _, declaration := range parsed.Decls {
			switch d := declaration.(type) {
			// Include unexported package functions too; callers decide which names have meaning.
			case *ast.FuncDecl:
				if d.Recv == nil {
					functions[d.Name.Name] = true
				}
			// Exported package-level values only. Multiple names, missing initializers and
			// computed initializers are reported as unsupported rather than omitted.
			case *ast.GenDecl:
				if d.Tok != token.VAR && d.Tok != token.CONST {
					continue
				}
				for _, spec := range d.Specs {
					valueSpec := spec.(*ast.ValueSpec)
					for _, ident := range valueSpec.Names {
						if !ident.IsExported() {
							continue
						}
						described := f.unsupported(ident)
						if len(valueSpec.Names) == 1 && len(valueSpec.Values) == 1 {
							described = f.describe(valueSpec.Values[0])
						}
						encoded, err := json.Marshal(value{
							Pos:      f.pos(ident),
							Constant: d.Tok == token.CONST,
							Imports:  imports,
							Value:    described,
						})
						if err != nil {
							return err
						}
						values[ident.Name] = string(encoded)
					}
				}
			}
		}
	}
	declared := make([]string, 0, len(functions))
	for name := range functions {
		declared = append(declared, name)
	}
	sort.Strings(declared)
	return json.NewEncoder(os.Stdout).Encode(struct {
		Functions      []string          `json:"functions"`
		Values         map[string]string `json:"values"`
		SyntaxErrors   []string          `json:"syntax_errors"`
		BrowserEntries []browserEntry    `json:"browser_entries"`
		AssetErrors    []string          `json:"asset_errors"`
	}{declared, values, errors, entries, assetErrors})
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
