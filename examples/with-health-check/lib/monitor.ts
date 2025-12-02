export type HealthStatus = "healthy" | "unhealthy" | "degraded";

export interface HealthCheckResult {
  status: HealthStatus;
  timestamp: string;
  services: Record<string, ServiceHealth>;
  system: SystemMetrics;
}

export interface ServiceHealth {
  status: HealthStatus;
  latency: number;
  message?: string;
}

export interface SystemMetrics {
  memoryUsage: NodeJS.MemoryUsage;
  uptime: number;
}

export type HealthCheckCallback = () => Promise<Omit<ServiceHealth, "latency">>;

export class ResourceMonitor {
  private services: Map<string, HealthCheckCallback>;

  constructor() {
    this.services = new Map();
  }

  register(name: string, check: HealthCheckCallback) {
    this.services.set(name, check);
  }

  async check(): Promise<HealthCheckResult> {
    const results: Record<string, ServiceHealth> = {};
    let overallStatus: HealthStatus = "healthy";

    const checks = Array.from(this.services.entries()).map(
      async ([name, check]) => {
        const start = performance.now();
        try {
          const result = await check();
          const latency = Math.round(performance.now() - start);

          results[name] = {
            ...result,
            latency,
          };

          if (result.status === "unhealthy") {
            overallStatus = "unhealthy";
          } else if (
            result.status === "degraded" &&
            overallStatus !== "unhealthy"
          ) {
            overallStatus = "degraded";
          }
        } catch (error) {
          const latency = Math.round(performance.now() - start);
          results[name] = {
            status: "unhealthy",
            latency,
            message: error instanceof Error ? error.message : "Unknown error",
          };
          overallStatus = "unhealthy";
        }
      },
    );

    await Promise.all(checks);

    return {
      status: overallStatus,
      timestamp: new Date().toISOString(),
      services: results,
      system: {
        memoryUsage: process.memoryUsage(),
        uptime: process.uptime(),
      },
    };
  }
}

// Singleton instance for the application
export const monitor = new ResourceMonitor();

// Register default mock services (in a real app, these would be DB/Redis clients)
monitor.register("database", async () => {
  // Simulate DB check (latency is calculated automatically)
  return { status: "healthy" };
});

monitor.register("cache", async () => {
  // Simulate Redis check (latency is calculated automatically)
  return { status: "healthy" };
});
