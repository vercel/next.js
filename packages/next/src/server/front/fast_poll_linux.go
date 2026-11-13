//go:build linux

package main

// Ported from vercel/vercel-internal#2065.

import (
	"syscall"
	"unsafe"
)

type pollEvent struct {
	fd                  int
	tag                 *byte
	read, write, failed bool
}
type registration struct {
	tag        *byte
	generation int32
}
type poller struct {
	fd         int
	generation int32
	live       map[int]registration
	events     [256]syscall.EpollEvent
	ready      [256]pollEvent
}

func newPoller(listener int) (*poller, error) {
	fd, e := syscall.EpollCreate1(syscall.EPOLL_CLOEXEC)
	if e != nil {
		return nil, e
	}
	p := &poller{fd: fd, live: map[int]registration{}}
	e = p.watch(listener, nil, true, false)
	if e != nil {
		p.close()
	}
	return p, e
}
func (p *poller) watch(fd int, tag *byte, read, write bool) error {
	reg, exists := p.live[fd]
	op := syscall.EPOLL_CTL_MOD
	if !exists {
		p.generation++
		reg = registration{tag, p.generation}
		op = syscall.EPOLL_CTL_ADD
	}
	events := uint32(0)
	if read {
		events |= syscall.EPOLLIN
	}
	if write {
		events |= syscall.EPOLLOUT
	}
	e := syscall.EpollCtl(p.fd, op, fd, &syscall.EpollEvent{Events: events, Fd: int32(fd), Pad: reg.generation})
	if e == nil {
		p.live[fd] = reg
	}
	return e
}
func (p *poller) remove(fd int) {
	syscall.EpollCtl(p.fd, syscall.EPOLL_CTL_DEL, fd, nil)
	delete(p.live, fd)
}
func (p *poller) stopAccept(fd int) { p.remove(fd) }
func (p *poller) wait() ([]pollEvent, error) {
	n, e := syscall.EpollWait(p.fd, p.events[:], 100)
	if e != nil {
		return nil, e
	}
	out := p.ready[:0]
	for _, v := range p.events[:n] {
		reg, ok := p.live[int(v.Fd)]
		if !ok || reg.generation != v.Pad {
			continue
		}
		out = append(out, pollEvent{int(v.Fd), reg.tag, v.Events&(syscall.EPOLLIN|syscall.EPOLLHUP) != 0, v.Events&syscall.EPOLLOUT != 0, v.Events&syscall.EPOLLERR != 0})
	}
	return out, nil
}
func (p *poller) close() { syscall.Close(p.fd) }
func writev(fd int, a, b []byte) (int, error) {
	if len(b) == 0 {
		return syscall.Write(fd, a)
	}
	iov := [2]syscall.Iovec{{Base: &a[0]}, {Base: &b[0]}}
	iov[0].SetLen(len(a))
	iov[1].SetLen(len(b))
	n, _, e := syscall.Syscall(syscall.SYS_WRITEV, uintptr(fd), uintptr(unsafe.Pointer(&iov[0])), 2)
	if e != 0 {
		return 0, e
	}
	return int(n), nil
}
