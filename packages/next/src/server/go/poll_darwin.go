//go:build darwin

package main

import (
	"syscall"
	"time"
	"unsafe"
)

type pollEvent struct {
	fd                  int
	tag                 *byte
	read, write, failed bool
}
type poller struct {
	fd      int
	changes []syscall.Kevent_t
	live    map[int]*byte
}

func newPoller(listener int) (*poller, error) {
	fd, e := syscall.Kqueue()
	if e != nil {
		return nil, e
	}
	p := &poller{fd: fd, live: map[int]*byte{}}
	e = p.watch(listener, nil, true, false)
	if e != nil {
		p.close()
	}
	return p, e
}
func (p *poller) watch(fd int, tag *byte, read, write bool) error {
	p.live[fd] = tag
	for i, on := range []bool{read, write} {
		var e syscall.Kevent_t
		f := syscall.EVFILT_READ
		if i == 1 {
			f = syscall.EVFILT_WRITE
		}
		flags := syscall.EV_ADD | syscall.EV_DISABLE
		if on {
			flags = syscall.EV_ADD | syscall.EV_ENABLE
		}
		syscall.SetKevent(&e, fd, f, flags)
		e.Udata = tag
		p.changes = append(p.changes, e)
	}
	return nil
}
func (p *poller) remove(fd int) { delete(p.live, fd) }
func (p *poller) stopAccept(fd int) {
	p.remove(fd)
	var event syscall.Kevent_t
	syscall.SetKevent(&event, fd, syscall.EVFILT_READ, syscall.EV_DELETE)
	syscall.Kevent(p.fd, []syscall.Kevent_t{event}, nil, nil)
}
func (p *poller) wait() ([]pollEvent, error) {
	live := p.changes[:0]
	for _, e := range p.changes {
		if tag, ok := p.live[int(e.Ident)]; ok && tag == e.Udata {
			live = append(live, e)
		}
	}
	var events [256]syscall.Kevent_t
	t := syscall.NsecToTimespec(int64(100 * time.Millisecond))
	n, e := syscall.Kevent(p.fd, live, events[:], &t)
	p.changes = p.changes[:0]
	if e != nil {
		return nil, e
	}
	out := make([]pollEvent, 0, n)
	for _, v := range events[:n] {
		out = append(out, pollEvent{int(v.Ident), v.Udata, v.Filter == syscall.EVFILT_READ, v.Filter == syscall.EVFILT_WRITE, v.Flags&syscall.EV_ERROR != 0})
	}
	return out, nil
}
func (p *poller) close()     { syscall.Close(p.fd) }
func suppressSIGPIPE(fd int) { syscall.SetsockoptInt(fd, syscall.SOL_SOCKET, syscall.SO_NOSIGPIPE, 1) }
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
func remoteIP(a syscall.Sockaddr) string { return sockaddrIP(a) }
