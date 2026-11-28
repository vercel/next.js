const endpoints = [
  { href: "/api/users", label: "GET /api/users" },
  { href: "/api/users/1", label: "GET /api/users/1" },
  { href: "/api/cors", label: "GET /api/cors" },
  { href: "/api/cookies", label: "GET /api/cookies" },
  { href: "/api/graphql", label: "GraphiQL at /api/graphql" },
];

export default function Home() {
  return (
    <main>
      <h1>Route Handlers</h1>
      <p>
        Each <code>route.ts</code> file in <code>app</code> is an endpoint. Open
        one to see its response:
      </p>
      <ul>
        {endpoints.map(({ href, label }) => (
          <li key={href}>
            <a href={href}>{label}</a>
          </li>
        ))}
      </ul>
    </main>
  );
}
