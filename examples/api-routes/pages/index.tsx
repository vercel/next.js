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
      <h1>API Routes</h1>
      <p>
        Each file in <code>pages/api</code> is an endpoint. Open one to see its
        response:
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
