package routing

import "testing"

func BenchmarkDecide(b *testing.B) {
	table, err := Load([]byte(`{"contract":{"version":1},"maxHeaderBytes":16384,"compress":true,
"nodePrefixes":["/_next/","/static/"],"nodeRequestHeaders":["rsc"],
"nodeExact":["/","/api/users/new","/favicon.ico"],"goExact":{"/api/echo":"/api/echo/route"},
"dynamic":[{"path":["blog",{"param":"slug"}]},{"path":["api","users",{"param":"id"}],"go":"/api/users/[id]/route"}]}`))
	if err != nil {
		b.Fatal(err)
	}
	header := map[string][]string{"User-Agent": {"loadgen"}, "Accept": {"*/*"}, "X-Forwarded-For": {"10.0.0.1"}}
	for _, target := range []string{"/api/users/42?sort=asc&page=2", "/api/echo", "/blog/hello"} {
		b.Run(target, func(b *testing.B) {
			r := Request{Method: "GET", Target: target, Proto: "HTTP/1.1", Header: header}
			b.ReportAllocs()
			for i := 0; i < b.N; i++ {
				table.Decide(r)
			}
		})
	}
}
