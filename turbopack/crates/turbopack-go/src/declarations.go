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
	"strings"
)

func main() {
	if err := analyze(); err != nil {
		fmt.Fprintln(os.Stderr, err)
		os.Exit(1)
	}
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
	var sources map[string]string
	if err := json.NewDecoder(os.Stdin).Decode(&sources); err != nil {
		return err
	}
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
	packages := map[string]bool{}
	selectedFunctions := map[string]bool{}
	selectedPackages := map[string]bool{}
	errors := []string{}
	for _, name := range names {
		file, err := parser.ParseFile(token.NewFileSet(), name, sources[name], parser.SkipObjectResolution)
		if err != nil {
			errors = append(errors, err.Error())
			continue
		}
		// A file whose constraints cannot be evaluated is left for the compiler to report.
		selected, err := context.MatchFile("", path.Base(name))
		if err != nil {
			selected = true
		}
		// MatchFile leaves cgo files to the importer, which ignores them when cgo is disabled.
		for _, spec := range file.Imports {
			if spec.Path.Value == `"C"` {
				selected = false
			}
		}
		packages[file.Name.Name] = true
		if selected {
			selectedPackages[file.Name.Name] = true
		}
		// Include unexported package functions too; callers decide which names have meaning.
		for _, declaration := range file.Decls {
			if function, ok := declaration.(*ast.FuncDecl); ok && function.Recv == nil {
				functions[function.Name.Name] = true
				if selected {
					selectedFunctions[function.Name.Name] = true
				}
			}
		}
	}
	return json.NewEncoder(os.Stdout).Encode(struct {
		Functions         []string `json:"functions"`
		Packages          []string `json:"packages"`
		SelectedFunctions []string `json:"selected_functions"`
		SelectedPackages  []string `json:"selected_packages"`
		SyntaxErrors      []string `json:"syntax_errors"`
	}{sorted(functions), sorted(packages), sorted(selectedFunctions), sorted(selectedPackages), errors})
}
