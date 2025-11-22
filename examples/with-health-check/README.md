# Health Check Example

This example demonstrates how to implement a robust health check and resource monitoring system in Next.js using App Router and Route Handlers.

## Features

- **Centralized Resource Monitor**: A `ResourceMonitor` class to manage health checks for various services (Database, Redis, External APIs).
- **Standard Health Endpoint**: An API route (`/api/health`) that returns a standardized JSON response compatible with Kubernetes probes and monitoring tools.
- **Dashboard UI**: A simple dashboard to visualize the health status of all services.
- **Performance Metrics**: Tracks latency for each service check.

## How to Use

Execute [`create-next-app`](https://github.com/vercel/next.js/tree/canary/packages/create-next-app) with [npm](https://docs.npmjs.com/cli/init), [Yarn](https://yarnpkg.com/lang/en/docs/cli/create/), or [pnpm](https://pnpm.io) to bootstrap the example:

```bash
npx create-next-app --example with-health-check with-health-check-app
```

## Implementation Details

The core logic resides in `lib/monitor.ts`. You can register new services to monitor like this:

```typescript
import { monitor } from '@/lib/monitor'
import { db } from '@/lib/db'

monitor.register('database', async () => {
  await db.query('SELECT 1')
  return { status: 'healthy', latency: 0 }
})
```

The health check endpoint is available at `/api/health`.
