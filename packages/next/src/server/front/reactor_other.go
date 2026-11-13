//go:build !linux

package main

import (
	"errors"
	"net"
	"sync"
)

// The epoll reactor is Linux-only; elsewhere next-front always uses net/http.
const reactorSupported = false

type frontend struct{ wg sync.WaitGroup }

func newFrontend(config, *net.TCPAddr) (*frontend, error) {
	return nil, errors.New("the reactor requires Linux")
}
func (f *frontend) serve(*net.TCPListener) error { return errors.New("the reactor requires Linux") }
func (f *frontend) beginDrain()                  {}
