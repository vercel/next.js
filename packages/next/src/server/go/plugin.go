//go:build linux || darwin

package main

import (
	"debug/buildinfo"
	"errors"
	"fmt"
	"net/http"
	"plugin"
	"runtime"
	"runtime/debug"
)

type routeHandler = func(http.ResponseWriter, *http.Request, map[string][]string)

// Linker-only flags and application module dependencies are deliberately absent.
// Go's loader additionally verifies the hashes of every shared package.
var compatibleSettings = []string{
	"-compiler", "-tags", "-trimpath", "-gcflags", "-asmflags", "-race", "-msan", "-asan",
	"CGO_ENABLED", "CGO_CFLAGS", "CGO_CPPFLAGS", "CGO_CXXFLAGS", "CGO_LDFLAGS",
	"GOEXPERIMENT", "GOAMD64", "GOARM64", "GOARM", "GO386", "GOMIPS", "GOMIPS64", "GOPPC64", "GORISCV64",
}

type pluginBuildInfo struct {
	Protocol  string            `json:"protocol"`
	GoVersion string            `json:"goVersion"`
	Goos      string            `json:"goos"`
	Goarch    string            `json:"goarch"`
	Settings  map[string]string `json:"settings"`
}

func buildSettings(info *debug.BuildInfo) map[string]string {
	settings := make(map[string]string, len(info.Settings))
	for _, setting := range info.Settings {
		settings[setting.Key] = setting.Value
	}
	return settings
}

func frontendBuildInfo() (pluginBuildInfo, error) {
	info, ok := debug.ReadBuildInfo()
	if !ok {
		return pluginBuildInfo{}, errors.New("missing Go frontend build information")
	}
	all := buildSettings(info)
	if all["CGO_ENABLED"] != "1" {
		return pluginBuildInfo{}, errors.New("Go plugins require a CGO-enabled frontend")
	}
	settings := make(map[string]string, len(compatibleSettings))
	for _, name := range compatibleSettings {
		settings[name] = all[name]
	}
	return pluginBuildInfo{protocol, info.GoVersion, runtime.GOOS, runtime.GOARCH, settings}, nil
}

// Check build metadata before Open can execute application init functions. This
// is a compatibility check, not a sandbox: application plugins are trusted code.
func loadPlugin(file string) (map[string]routeHandler, error) {
	host, err := frontendBuildInfo()
	if err != nil {
		return nil, err
	}
	info, err := buildinfo.ReadFile(file)
	if err != nil {
		return nil, fmt.Errorf("read Go plugin build information: %w", err)
	}
	settings := buildSettings(info)
	if info.GoVersion != host.GoVersion || settings["GOOS"] != host.Goos || settings["GOARCH"] != host.Goarch || settings["-buildmode"] != "plugin" {
		return nil, fmt.Errorf("incompatible Go plugin: rebuild with %s for %s/%s", host.GoVersion, host.Goos, host.Goarch)
	}
	for _, name := range compatibleSettings {
		if settings[name] != host.Settings[name] {
			return nil, fmt.Errorf("incompatible Go plugin build setting %s; rebuild with the published frontend configuration", name)
		}
	}
	module, err := plugin.Open(file)
	if err != nil {
		return nil, fmt.Errorf("load Go plugin (shared packages must match the frontend): %w", err)
	}
	version, err := module.Lookup("NextGoPluginVersion")
	if err != nil {
		return nil, err
	}
	value, ok := version.(*string)
	if !ok || *value != protocol {
		return nil, errors.New("incompatible Go plugin interface")
	}
	symbol, err := module.Lookup("NextGoHandlers")
	if err != nil {
		return nil, err
	}
	handlers, ok := symbol.(*map[string]func(http.ResponseWriter, *http.Request, map[string][]string))
	if !ok || handlers == nil || len(*handlers) == 0 || len(*handlers) > 100000 {
		return nil, errors.New("invalid Go plugin handler registry")
	}
	result := make(map[string]routeHandler, len(*handlers))
	for id, handler := range *handlers {
		if id == "" || handler == nil {
			return nil, errors.New("invalid Go plugin handler")
		}
		result[id] = handler
	}
	return result, nil
}
