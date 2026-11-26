package main

import (
	"bytes"
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"time"
)

func main() {
	if len(os.Args) > 1 && os.Args[1] == "hold-stderr" {
		time.Sleep(4 * time.Second)
		return
	}
	switch strings.TrimSuffix(filepath.Base(os.Args[0]), ".exe") {
	case "go-routes-ok":
		cwd, err := os.Getwd()
		if err != nil {
			panic(err)
		}
		log, err := os.OpenFile("log", os.O_CREATE|os.O_APPEND|os.O_WRONLY, 0600)
		if err != nil {
			panic(err)
		}
		defer log.Close()
		fmt.Fprintln(log, os.Getenv("__NEXT_GO_STARTUP_CHECK"), cwd)
	case "go-routes-fail":
		fmt.Fprintln(os.Stderr, `panic: pattern "/metrics" conflicts`)
		os.Exit(2)
	case "go-routes-noisy":
		os.Stdout.Write(bytes.Repeat([]byte("x"), 4_000_000))
	case "go-routes-chatty":
		fmt.Fprint(os.Stderr, "0123456789abcdef")
		time.Sleep(5 * time.Second)
	case "go-routes-background", "go-routes-background-fail", "go-routes-slow":
		child := exec.Command(os.Args[0], "hold-stderr")
		child.Stderr = os.Stderr
		if err := child.Start(); err != nil {
			panic(err)
		}
		pids, err := os.OpenFile("child-pids", os.O_CREATE|os.O_APPEND|os.O_WRONLY, 0600)
		if err != nil {
			panic(err)
		}
		fmt.Fprintln(pids, child.Process.Pid)
		pids.Close()
		if strings.Contains(os.Args[0], "go-routes-slow") {
			fmt.Fprintln(os.Stderr, "connecting")
			time.Sleep(5 * time.Second)
			return
		}
		if strings.Contains(os.Args[0], "background-fail") {
			fmt.Fprintln(os.Stderr, "boom")
			os.Exit(3)
		}
		fmt.Fprintln(os.Stderr, "initialized")
	default:
		panic("unknown startup fixture")
	}
}
