module next/go

// The lowest version the SDK sources need, so that application modules
// declaring an older go line can require it without go.mod updates, which
// -mod=readonly builds refuse. Next.js itself requires a Go 1.24 toolchain.
go 1.21
