// This tool forwards Go commands and can hold a completed build before publication.
package main

import (
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"time"
)

func main() {
	self, err := os.Executable()
	if err != nil {
		panic(err)
	}
	goPath, err := os.ReadFile(self + ".go-path")
	if err != nil {
		panic(err)
	}
	control, err := os.ReadFile(self + ".control-path")
	if err != nil {
		panic(err)
	}
	action := "build"
	if selected, err := os.ReadFile(filepath.Join(string(control), "action")); err == nil {
		action = string(selected)
	} else if !os.IsNotExist(err) {
		panic(err)
	}
	command := exec.Command(string(goPath), os.Args[1:]...)
	command.Stdin, command.Stdout, command.Stderr = os.Stdin, os.Stdout, os.Stderr
	if err := command.Run(); err != nil {
		if status, ok := err.(*exec.ExitError); ok {
			os.Exit(status.ExitCode())
		}
		fmt.Fprintln(os.Stderr, err)
		os.Exit(1)
	}
	if len(os.Args) > 1 && os.Args[1] == action {
		if _, err := os.Stat(filepath.Join(string(control), "stall")); err == nil {
			if _, err := os.Stat(filepath.Join(string(control), "ready")); err == nil {
				return
			}
			if err := os.WriteFile(filepath.Join(string(control), "ready"), nil, 0600); err != nil {
				panic(err)
			}
			deadline := time.Now().Add(time.Minute)
			// The CLI timeout regression uses the real 180-second command deadline.
			if _, err := os.Stat(filepath.Join(string(control), "timeout")); err == nil {
				deadline = time.Now().Add(4 * time.Minute)
			}
			for {
				if _, err := os.Stat(filepath.Join(string(control), "resume")); err == nil {
					break
				}
				if time.Now().After(deadline) {
					panic("timed out waiting for test to resume build")
				}
				time.Sleep(10 * time.Millisecond)
			}
		}
	}
}
