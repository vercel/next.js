/**
 * Performance Monitoring Utility for Next.js
 * 
 * This module provides utilities for monitoring and tracking performance metrics
 * in Next.js applications, including render times, API response times, and more.
 * 
 * @example
 * ```typescript
 * const monitor = new PerformanceMonitor('page-render');
 * // ... do work
 * monitor.end();
 * console.log(`Operation took ${monitor.getDuration()}ms`);
 * ```
 */

export interface PerformanceMetric {
  name: string
  startTime: number
  endTime?: number
  duration?: number
  metadata?: Record<string, any>
}

export interface PerformanceMonitorOptions {
  /**
   * Whether to automatically log performance metrics
   * @default false
   */
  autoLog?: boolean
  
  /**
   * Custom logging function
   */
  logger?: (metric: PerformanceMetric) => void
  
  /**
   * Threshold in milliseconds for warning logs
   * @default 1000
   */
  warningThreshold?: number
}

/**
 * Performance monitoring class for tracking operation durations
 */
export class PerformanceMonitor {
  private startTime: number
  private endTime?: number
  private readonly name: string
  private readonly options: PerformanceMonitorOptions
  private metadata: Record<string, any> = {}

  constructor(name: string, options: PerformanceMonitorOptions = {}) {
    this.name = name
    this.startTime = performance.now()
    this.options = {
      autoLog: false,
      warningThreshold: 1000,
      ...options,
    }
  }

  /**
   * Add metadata to the performance metric
   */
  addMetadata(key: string, value: any): this {
    this.metadata[key] = value
    return this
  }

  /**
   * End the performance measurement
   */
  end(): number {
    if (this.endTime !== undefined) {
      throw new Error('PerformanceMonitor.end() called multiple times')
    }

    this.endTime = performance.now()
    const duration = this.getDuration()

    if (this.options.autoLog) {
      this.log()
    }

    return duration
  }

  /**
   * Get the duration of the measurement in milliseconds
   */
  getDuration(): number {
    const end = this.endTime ?? performance.now()
    return end - this.startTime
  }

  /**
   * Get the complete metric object
   */
  getMetric(): PerformanceMetric {
    return {
      name: this.name,
      startTime: this.startTime,
      endTime: this.endTime,
      duration: this.endTime ? this.getDuration() : undefined,
      metadata: Object.keys(this.metadata).length > 0 ? this.metadata : undefined,
    }
  }

  /**
   * Log the performance metric
   */
  log(): void {
    const metric = this.getMetric()
    
    if (this.options.logger) {
      this.options.logger(metric)
      return
    }

    const duration = this.getDuration()
    const threshold = this.options.warningThreshold ?? 1000
    
    if (duration > threshold) {
      console.warn(
        `⚠️ Performance Warning: ${this.name} took ${duration.toFixed(2)}ms`,
        this.metadata
      )
    } else {
      console.log(
        `📊 Performance: ${this.name} took ${duration.toFixed(2)}ms`,
        this.metadata
      )
    }
  }

  /**
   * Create a child monitor for nested operations
   */
  createChild(name: string): PerformanceMonitor {
    return new PerformanceMonitor(`${this.name} > ${name}`, this.options)
  }
}

/**
 * Decorator for measuring method performance
 * 
 * @example
 * ```typescript
 * class MyClass {
 *   @measurePerformance('MyClass.expensiveMethod')
 *   expensiveMethod() {
 *     // ... expensive operation
 *   }
 * }
 * ```
 */
export function measurePerformance(name?: string) {
  return function (
    target: any,
    propertyKey: string,
    descriptor: PropertyDescriptor
  ) {
    const originalMethod = descriptor.value
    const metricName = name ?? `${target.constructor.name}.${propertyKey}`

    descriptor.value = async function (...args: any[]) {
      const monitor = new PerformanceMonitor(metricName, { autoLog: true })
      try {
        const result = await originalMethod.apply(this, args)
        monitor.end()
        return result
      } catch (error) {
        monitor.addMetadata('error', true)
        monitor.end()
        throw error
      }
    }

    return descriptor
  }
}

/**
 * Global performance tracker for aggregating metrics
 */
class PerformanceTracker {
  private metrics: Map<string, PerformanceMetric[]> = new Map()
  private enabled: boolean = true

  /**
   * Record a performance metric
   */
  record(metric: PerformanceMetric): void {
    if (!this.enabled) return

    const existing = this.metrics.get(metric.name) ?? []
    existing.push(metric)
    this.metrics.set(metric.name, existing)
  }

  /**
   * Get statistics for a specific metric name
   */
  getStats(name: string): {
    count: number
    average: number
    min: number
    max: number
    total: number
  } | null {
    const metrics = this.metrics.get(name)
    if (!metrics || metrics.length === 0) return null

    const durations = metrics
      .filter((m) => m.duration !== undefined)
      .map((m) => m.duration!)

    if (durations.length === 0) return null

    return {
      count: durations.length,
      average: durations.reduce((a, b) => a + b, 0) / durations.length,
      min: Math.min(...durations),
      max: Math.max(...durations),
      total: durations.reduce((a, b) => a + b, 0),
    }
  }

  /**
   * Get all recorded metrics
   */
  getAllMetrics(): Map<string, PerformanceMetric[]> {
    return new Map(this.metrics)
  }

  /**
   * Clear all recorded metrics
   */
  clear(): void {
    this.metrics.clear()
  }

  /**
   * Enable or disable the tracker
   */
  setEnabled(enabled: boolean): void {
    this.enabled = enabled
  }

  /**
   * Generate a performance report
   */
  generateReport(): string {
    const lines: string[] = ['', '📊 Performance Report', '='.repeat(50)]

    for (const [name, metrics] of this.metrics.entries()) {
      const stats = this.getStats(name)
      if (stats) {
        lines.push(`\n${name}:`)
        lines.push(`  Count: ${stats.count}`)
        lines.push(`  Average: ${stats.average.toFixed(2)}ms`)
        lines.push(`  Min: ${stats.min.toFixed(2)}ms`)
        lines.push(`  Max: ${stats.max.toFixed(2)}ms`)
        lines.push(`  Total: ${stats.total.toFixed(2)}ms`)
      }
    }

    lines.push('='.repeat(50))
    return lines.join('\n')
  }
}

/**
 * Global singleton instance of the performance tracker
 */
export const performanceTracker = new PerformanceTracker()

/**
 * Utility function to measure the execution time of an async function
 * 
 * @example
 * ```typescript
 * const result = await measureAsync('fetchData', async () => {
 *   return await fetch('/api/data');
 * });
 * ```
 */
export async function measureAsync<T>(
  name: string,
  fn: () => Promise<T>,
  options?: PerformanceMonitorOptions
): Promise<T> {
  const monitor = new PerformanceMonitor(name, { autoLog: true, ...options })
  try {
    const result = await fn()
    monitor.end()
    performanceTracker.record(monitor.getMetric())
    return result
  } catch (error) {
    monitor.addMetadata('error', true)
    monitor.end()
    performanceTracker.record(monitor.getMetric())
    throw error
  }
}

/**
 * Utility function to measure the execution time of a sync function
 * 
 * @example
 * ```typescript
 * const result = measureSync('processData', () => {
 *   return expensiveOperation();
 * });
 * ```
 */
export function measureSync<T>(
  name: string,
  fn: () => T,
  options?: PerformanceMonitorOptions
): T {
  const monitor = new PerformanceMonitor(name, { autoLog: true, ...options })
  try {
    const result = fn()
    monitor.end()
    performanceTracker.record(monitor.getMetric())
    return result
  } catch (error) {
    monitor.addMetadata('error', true)
    monitor.end()
    performanceTracker.record(monitor.getMetric())
    throw error
  }
}
