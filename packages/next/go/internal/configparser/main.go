// This tool parses entrypoint source bytes. It never imports or executes an app.
package main

import (
	"encoding/json"
	"fmt"
	"go/ast"
	"go/parser"
	"go/token"
	"os"
	"strconv"
)

const sdkPath = "github.com/vercel/next.js/packages/next/go"

type input struct {
	Filename string `json:"filename"`
	Source   string `json:"source"`
	Kind     string `json:"kind"`
}

type reader struct {
	positions *token.FileSet
	aliases   map[string]bool
}

func (r reader) fail(node ast.Node, message string) error {
	return fmt.Errorf("%s: %s", r.positions.Position(node.Pos()), message)
}

func (r reader) sdkType(expr ast.Expr, name string) bool {
	selector, ok := expr.(*ast.SelectorExpr)
	if !ok || selector.Sel.Name != name {
		return false
	}
	alias, ok := selector.X.(*ast.Ident)
	return ok && r.aliases[alias.Name]
}

func (r reader) fields(literal *ast.CompositeLit, allowed map[string]func(ast.Expr) (any, error)) (map[string]any, error) {
	values := map[string]any{}
	for _, element := range literal.Elts {
		field, ok := element.(*ast.KeyValueExpr)
		if !ok {
			return nil, r.fail(element, "Config requires named fields")
		}
		key, ok := field.Key.(*ast.Ident)
		if !ok {
			return nil, r.fail(field.Key, "Config requires named fields")
		}
		parse, ok := allowed[key.Name]
		if !ok {
			return nil, r.fail(key, "unsupported Config field "+key.Name)
		}
		if _, duplicate := values[key.Name]; duplicate {
			return nil, r.fail(key, "duplicate Config field "+key.Name)
		}
		value, err := parse(field.Value)
		if err != nil {
			return nil, err
		}
		values[key.Name] = value
	}
	return values, nil
}

func (r reader) text(expr ast.Expr) (any, error) {
	literal, ok := expr.(*ast.BasicLit)
	if !ok || literal.Kind != token.STRING {
		return nil, r.fail(expr, "Config values must be static string literals")
	}
	return strconv.Unquote(literal.Value)
}

func (r reader) duration(expr ast.Expr) (any, error) {
	literal, ok := expr.(*ast.BasicLit)
	if ok && literal.Kind == token.INT {
		value, err := strconv.ParseInt(literal.Value, 0, 32)
		if err == nil && value > 0 {
			return value, nil
		}
	}
	return nil, r.fail(expr, "MaxDuration must be a positive integer literal")
}

func (r reader) strings(expr ast.Expr) (any, error) {
	literal, ok := expr.(*ast.CompositeLit)
	if !ok {
		return nil, r.fail(expr, "PreferredRegion must be a []string literal")
	}
	array, ok := literal.Type.(*ast.ArrayType)
	if !ok || array.Len != nil {
		return nil, r.fail(expr, "PreferredRegion must be a []string literal")
	}
	typeName, ok := array.Elt.(*ast.Ident)
	if !ok || typeName.Name != "string" {
		return nil, r.fail(expr, "PreferredRegion must be a []string literal")
	}
	values := []string{}
	for _, element := range literal.Elts {
		value, err := r.text(element)
		if err != nil {
			return nil, err
		}
		if value == "" {
			return nil, r.fail(element, "PreferredRegion entries must not be empty")
		}
		values = append(values, value.(string))
	}
	if len(values) == 0 {
		return nil, r.fail(expr, "PreferredRegion must contain at least one region")
	}
	return values, nil
}

func (r reader) locale(expr ast.Expr) (any, error) {
	value, ok := expr.(*ast.Ident)
	if !ok || value.Name != "false" {
		return nil, r.fail(expr, "Locale must be the literal false, or omitted")
	}
	return false, nil
}

func (r reader) list(expr ast.Expr, name string, fields map[string]func(ast.Expr) (any, error)) (any, error) {
	literal, ok := expr.(*ast.CompositeLit)
	if !ok {
		return nil, r.fail(expr, "Config requires a []next."+name+" literal")
	}
	array, ok := literal.Type.(*ast.ArrayType)
	if !ok || array.Len != nil || !r.sdkType(array.Elt, name) {
		return nil, r.fail(expr, "Config requires a []next."+name+" literal")
	}
	values := []map[string]any{}
	for _, element := range literal.Elts {
		item, ok := element.(*ast.CompositeLit)
		if !ok || (item.Type != nil && !r.sdkType(item.Type, name)) {
			return nil, r.fail(element, "Config requires next."+name+" struct literals")
		}
		value, err := r.fields(item, fields)
		if err != nil {
			return nil, err
		}
		values = append(values, lowerKeys(value))
	}
	return values, nil
}

func (r reader) conditions(expr ast.Expr) (any, error) {
	return r.list(expr, "RouteHas", map[string]func(ast.Expr) (any, error){
		"Type": r.text, "Key": r.text, "Value": r.text,
	})
}

func (r reader) matchers(expr ast.Expr) (any, error) {
	return r.list(expr, "Matcher", map[string]func(ast.Expr) (any, error){
		"Source": r.text, "Has": r.conditions, "Missing": r.conditions, "Locale": r.locale,
	})
}

func lowerKeys(fields map[string]any) map[string]any {
	result := map[string]any{}
	for key, value := range fields {
		// All supported field names begin with an ASCII uppercase letter.
		result[string(key[0]+'a'-'A')+key[1:]] = value
	}
	return result
}

func extract(in input) (map[string]any, error) {
	if in.Kind != "route" && in.Kind != "proxy" {
		return nil, fmt.Errorf("unknown Go entrypoint kind %q", in.Kind)
	}
	r := reader{positions: token.NewFileSet(), aliases: map[string]bool{}}
	file, err := parser.ParseFile(r.positions, in.Filename, in.Source, parser.SkipObjectResolution)
	if err != nil {
		return nil, err
	}
	for _, imp := range file.Imports {
		path, err := strconv.Unquote(imp.Path.Value)
		if err != nil || path != sdkPath {
			continue
		}
		alias := "next"
		if imp.Name != nil {
			alias = imp.Name.Name
		}
		if alias != "." && alias != "_" {
			r.aliases[alias] = true
		}
	}
	var config *ast.CompositeLit
	for _, declaration := range file.Decls {
		if function, ok := declaration.(*ast.FuncDecl); ok && function.Recv == nil && function.Name.Name == "Config" {
			return nil, r.fail(function, "Config must be a var initialized with a next config struct literal")
		}
		decl, ok := declaration.(*ast.GenDecl)
		if !ok {
			continue
		}
		for _, spec := range decl.Specs {
			value, ok := spec.(*ast.ValueSpec)
			if !ok {
				continue
			}
			for _, name := range value.Names {
				if name.Name != "Config" {
					continue
				}
				if config != nil {
					return nil, r.fail(name, "duplicate Config declaration")
				}
				if decl.Tok != token.VAR || len(value.Names) != 1 || len(value.Values) != 1 {
					return nil, r.fail(value, "Config must be a var initialized with a next config struct literal")
				}
				config, ok = value.Values[0].(*ast.CompositeLit)
				typeName := "RouteConfig"
				if in.Kind == "proxy" {
					typeName = "ProxyConfig"
				}
				if !ok || !r.sdkType(config.Type, typeName) {
					return nil, r.fail(value, "Config must use a static next."+typeName+" literal")
				}
			}
		}
	}
	if config == nil {
		return map[string]any{}, nil
	}
	fields := map[string]func(ast.Expr) (any, error){"MaxDuration": r.duration, "PreferredRegion": r.strings}
	if in.Kind == "proxy" {
		fields["Matcher"] = r.matchers
	}
	values, err := r.fields(config, fields)
	if err != nil {
		return nil, err
	}
	return lowerKeys(values), nil
}

func main() {
	var in input
	if err := json.NewDecoder(os.Stdin).Decode(&in); err != nil {
		fmt.Fprintln(os.Stderr, err)
		os.Exit(1)
	}
	config, err := extract(in)
	if err != nil {
		fmt.Fprintln(os.Stderr, err)
		os.Exit(1)
	}
	if err := json.NewEncoder(os.Stdout).Encode(config); err != nil {
		fmt.Fprintln(os.Stderr, err)
		os.Exit(1)
	}
}
