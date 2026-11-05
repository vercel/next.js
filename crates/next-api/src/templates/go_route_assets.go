package main

import (
	"encoding/base64"
	"encoding/json"
	"fmt"
	"net/http"
	"os"

	nextassets "next/go/assets"
)

func nextGoAssetsWriter(w http.ResponseWriter, r *http.Request) (http.ResponseWriter, error) {
	var data []byte
	var err error
	// __NEXT_GO_ASSET_TRANSPORT__
	r.Header.Del("x-next-internal-go-assets")
	if err != nil {
		return w, err
	}
	var manifest nextassets.Manifest
	if err := json.Unmarshal(data, &manifest); err != nil {
		return w, fmt.Errorf("invalid browser manifest: %w", err)
	}
	return nextassets.WithManifest(w, manifest), nil
}

// Adapter outputs are relocatable and carry their browser manifest beside the binary.
func nextGoReadAssets() ([]byte, error) {
	executable, err := os.Executable()
	if err != nil {
		return nil, err
	}
	return os.ReadFile(executable + ".assets.json")
}

// Keep transport decoding in a function so both generated entrypoint variants compile.
func nextGoDecodeAssets(value string) ([]byte, error) {
	return base64.StdEncoding.DecodeString(value)
}
