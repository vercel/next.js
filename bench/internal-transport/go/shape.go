package main

// The request and response every benchmark sends: a browser-like GET (about
// 700 bytes of head) and a small route-handler response. Node's copy is in
// ../node/shape.mjs and must match.

var requestHeaders = []header{
	{"host", "localhost:3000"},
	{"user-agent", "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36"},
	{"accept", "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8"},
	{"accept-encoding", "gzip, deflate, br, zstd"},
	{"accept-language", "en-US,en;q=0.9"},
	{"cache-control", "no-cache"},
	{"cookie", "session=4f2c1e9a7b3d5f6e8a9b0c1d2e3f4a5b; theme=dark; _ga=GA1.1.1234567890.1700000000"},
	{"sec-ch-ua", "\"Chromium\";v=\"130\", \"Not?A_Brand\";v=\"99\""},
	{"sec-ch-ua-mobile", "?0"},
	{"sec-ch-ua-platform", "\"macOS\""},
	{"sec-fetch-dest", "document"},
	{"sec-fetch-mode", "navigate"},
	{"sec-fetch-site", "none"},
	{"x-forwarded-for", "203.0.113.7"},
	{"x-forwarded-proto", "https"},
	{"x-next-internal-go-token", "9b1f0c3e5a7d2f4b6e8a0c2e4f6a8b0d1e3f5a7c9e1b3d5f7a9c1e3f5b7d9f1a"},
}

const requestTarget = "/api/hello?name=next&page=2"

var responseHeaders = []header{
	{"content-type", "application/json; charset=utf-8"},
	{"cache-control", "private, no-cache, no-store, max-age=0, must-revalidate"},
	{"x-powered-by", "Next.js"},
	{"vary", "rsc, next-router-state-tree, next-router-prefetch"},
}

func body(size int) []byte {
	b := make([]byte, size)
	for i := range b {
		b[i] = 'a' + byte(i%26)
	}
	return b
}
