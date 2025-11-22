import { monitor } from "@/lib/monitor";

export const dynamic = "force-dynamic";

export default async function Page() {
  const health = await monitor.check();

  return (
    <main style={{ padding: "2rem", fontFamily: "system-ui, sans-serif" }}>
      <h1>System Health Dashboard</h1>

      <div
        style={{
          padding: "1rem",
          borderRadius: "8px",
          backgroundColor:
            health.status === "healthy"
              ? "#e6fffa"
              : health.status === "degraded"
                ? "#fffaf0"
                : "#fff5f5",
          border: `1px solid ${
            health.status === "healthy"
              ? "#38b2ac"
              : health.status === "degraded"
                ? "#ed8936"
                : "#fc8181"
          }`,
          marginBottom: "2rem",
        }}
      >
        <h2
          style={{
            margin: 0,
            color:
              health.status === "healthy"
                ? "#2c7a7b"
                : health.status === "degraded"
                  ? "#c05621"
                  : "#c53030",
          }}
        >
          Overall Status: {health.status.toUpperCase()}
        </h2>
        <p>Last updated: {new Date(health.timestamp).toLocaleString()}</p>
      </div>

      <div
        style={{
          display: "grid",
          gap: "1rem",
          gridTemplateColumns: "repeat(auto-fit, minmax(250px, 1fr))",
        }}
      >
        {Object.entries(health.services).map(([name, service]) => (
          <div
            key={name}
            style={{
              padding: "1rem",
              border: "1px solid #e2e8f0",
              borderRadius: "8px",
            }}
          >
            <h3 style={{ marginTop: 0, textTransform: "capitalize" }}>
              {name}
            </h3>
            <div
              style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}
            >
              <span
                role="status"
                aria-label={service.status}
                style={{
                  width: "10px",
                  height: "10px",
                  borderRadius: "50%",
                  backgroundColor:
                    service.status === "healthy"
                      ? "#48bb78"
                      : service.status === "degraded"
                        ? "#ed8936"
                        : "#f56565",
                }}
              />
              <span>{service.status}</span>
            </div>
            <p style={{ color: "#718096", fontSize: "0.9rem" }}>
              Latency: {service.latency}ms
            </p>
          </div>
        ))}
      </div>

      <div
        style={{
          marginTop: "2rem",
          padding: "1rem",
          backgroundColor: "#f7fafc",
          borderRadius: "8px",
        }}
      >
        <h3>System Metrics</h3>
        <pre style={{ overflow: "auto" }}>
          {JSON.stringify(health.system, null, 2)}
        </pre>
      </div>
    </main>
  );
}
