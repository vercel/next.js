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
	values := map[string]string{}
	errors := []string{}
	for _, name := range names {
		positions := token.NewFileSet()
		parsed, err := parser.ParseFile(positions, name, sources[name], parser.SkipObjectResolution)
		if err != nil {
			errors = append(errors, err.Error())
			continue
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
		Functions    []string          `json:"functions"`
		Values       map[string]string `json:"values"`
		SyntaxErrors []string          `json:"syntax_errors"`
	}{declared, values, errors})
}
