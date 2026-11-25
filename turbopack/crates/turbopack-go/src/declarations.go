// This build-time tool only parses source bytes. It never loads application code.
package main

import (
	"encoding/json"
	"flag"
	"fmt"
	"go/ast"
	"go/build"
	"go/parser"
	"go/token"
	"io"
	"os"
	"path"
	"sort"
	"strconv"
	"strings"
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
	Pos      string `json:"pos"`
	Constant bool   `json:"constant"`
	// Type is the declared type as written, such as "time.Duration", or empty for an
	// untyped declaration. A type typeName cannot render is reported as unsupportedType.
	Type    string       `json:"type,omitempty"`
	Imports []importSpec `json:"imports"`
	Value   node         `json:"value"`
}

// unsupportedType stands in for a declared type that typeName cannot render. It is not a
// valid Go type name, so it never matches a type a consumer accepts.
const unsupportedType = "(unsupported)"

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

func sorted(set map[string]bool) []string {
	names := make([]string, 0, len(set))
	for name := range set {
		names = append(names, name)
	}
	sort.Strings(names)
	return names
}

func analyze() error {
	goos := flag.String("goos", build.Default.GOOS, "target GOOS")
	goarch := flag.String("goarch", build.Default.GOARCH, "target GOARCH")
	tags := flag.String("tags", "", "comma-separated build tags")
	flag.Parse()
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
	// Evaluate file names and build constraints as the compiler does for this target.
	// Compilation always runs with CGO_ENABLED=0. Release tags come from this tool's
	// toolchain, which is the session's toolchain.
	context := build.Default
	context.GOOS = *goos
	context.GOARCH = *goarch
	context.CgoEnabled = false
	context.BuildTags = nil
	for _, tag := range strings.Split(*tags, ",") {
		if tag = strings.TrimSpace(tag); tag != "" {
			context.BuildTags = append(context.BuildTags, tag)
		}
	}
	// Selected files share one directory, so base names identify them.
	byBase := map[string]string{}
	for name, source := range sources {
		byBase[path.Base(name)] = source
	}
	context.OpenFile = func(name string) (io.ReadCloser, error) {
		source, ok := byBase[name]
		if !ok {
			return nil, os.ErrNotExist
		}
		return io.NopCloser(strings.NewReader(source)), nil
	}
	names := make([]string, 0, len(sources))
	for name := range sources {
		names = append(names, name)
	}
	sort.Strings(names)
	functions := map[string]bool{}
	values := map[string]value{}
	packages := map[string]bool{}
	selectedFunctions := map[string]bool{}
	selectedPackages := map[string]bool{}
	errors := []string{}
	for _, name := range names {
		positions := token.NewFileSet()
		// Object resolution lets Browser discovery ignore local identifiers that shadow imports.
		parsed, err := parser.ParseFile(positions, name, sources[name], 0)
		syntaxValid := err == nil
		if err != nil {
			errors = append(errors, err.Error())
		}
		// ParseFile returns a partial AST on syntax errors. Retain its package and
		// declarations so generated files do not mask the compiler's diagnostics.
		if parsed == nil || parsed.Name == nil || parsed.Name.Name == "" {
			continue
		}
		// A file whose constraints cannot be evaluated is left for the compiler to report.
		selected, err := context.MatchFile("", path.Base(name))
		if err != nil {
			selected = true
		}
		// MatchFile leaves cgo files to the importer, which ignores them when cgo is disabled.
		for _, spec := range parsed.Imports {
			if spec.Path != nil && spec.Path.Value == `"C"` {
				selected = false
			}
		}
		packages[parsed.Name.Name] = true
		if selected {
			selectedPackages[parsed.Name.Name] = true
		}
		if query.AssetPackage != "" && syntaxValid && selected {
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
				if d.Recv == nil && d.Name != nil && d.Name.Name != "" {
					functions[d.Name.Name] = true
					if selected {
						selectedFunctions[d.Name.Name] = true
					}
				}
			// Exported package-level values only. Multiple names, missing initializers and
			// computed initializers are reported as unsupported rather than omitted.
			case *ast.GenDecl:
				// Leave configuration in a partial AST for the compiler to diagnose.
				if !syntaxValid || (d.Tok != token.VAR && d.Tok != token.CONST) {
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
						declaredType := ""
						if valueSpec.Type != nil {
							if declaredType = typeName(valueSpec.Type); declaredType == "" {
								declaredType = unsupportedType
							}
						}
						values[ident.Name] = value{
							Pos:      f.pos(ident),
							Constant: d.Tok == token.CONST,
							Type:     declaredType,
							Imports:  imports,
							Value:    described,
						}
					}
				}
			}
		}
	}
	return json.NewEncoder(os.Stdout).Encode(struct {
		Functions         []string         `json:"functions"`
		Packages          []string         `json:"packages"`
		SelectedFunctions []string         `json:"selected_functions"`
		SelectedPackages  []string         `json:"selected_packages"`
		Values            map[string]value `json:"values"`
		SyntaxErrors      []string         `json:"syntax_errors"`
		BrowserEntries    []browserEntry   `json:"browser_entries"`
		AssetErrors       []string         `json:"asset_errors"`
	}{sorted(functions), sorted(packages), sorted(selectedFunctions), sorted(selectedPackages), values, errors, entries, assetErrors})
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
