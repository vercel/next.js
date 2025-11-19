/**
 * Example: Using Enhanced Error Handler and Performance Monitor in Next.js
 * 
 * This file demonstrates practical usage of the new utilities
 * in a real-world Next.js application scenario.
 */

import { 
  handleError, 
  globalErrorHandler,
  ErrorCategory,
  withErrorHandling,
  type NextEnhancedError
} from '../enhanced-error-handler'

import { 
  PerformanceMonitor,
  measureAsync,
  performanceTracker 
} from '../performance-monitor'

// ============================================================================
// Example 1: API Route with Enhanced Error Handling and Performance Monitoring
// ============================================================================

/**
 * Example API Route: GET /api/users/[id]
 * Shows error handling, performance monitoring, and proper response formatting
 */
export async function getUserAPI(request: Request, userId: string) {
  const monitor = new PerformanceMonitor('API: GET /api/users/:id', {
    autoLog: true,
    warningThreshold: 500 // Warn if request takes more than 500ms
  })

  monitor.addMetadata('userId', userId)
  monitor.addMetadata('method', 'GET')

  try {
    // Simulate database fetch
    const user = await fetchUserFromDatabase(userId)
    
    if (!user) {
      throw new Error(`User with ID ${userId} not found`)
    }

    monitor.addMetadata('userFound', true)
    const duration = monitor.end()
    
    return {
      success: true,
      data: user,
      metadata: {
        duration,
        timestamp: Date.now()
      }
    }
  } catch (error) {
    const handled = globalErrorHandler.handle(error, 'getUserAPI', {
      url: `/api/users/${userId}`,
      userId,
      metadata: { operation: 'fetch' }
    })

    monitor.addMetadata('error', true)
    monitor.addMetadata('errorCategory', handled.category)
    monitor.end()

    return {
      success: false,
      error: {
        message: handled.message,
        category: handled.category,
        recoverable: handled.recoverable,
        suggestion: handled.recoverySuggestion
      }
    }
  }
}

// ============================================================================
// Example 2: Server Component with Comprehensive Error Handling
// ============================================================================

/**
 * Example Server Component: User Profile Page
 * Demonstrates error boundaries, recovery strategies, and user-friendly errors
 */
export async function UserProfilePage({ params }: { params: { id: string } }) {
  const monitor = new PerformanceMonitor('ServerComponent: UserProfile')

  try {
    // Fetch user data with automatic performance tracking
    const user = await measureAsync('fetchUserData', async () => {
      return await fetchUserFromDatabase(params.id)
    })

    const posts = await measureAsync('fetchUserPosts', async () => {
      return await fetchUserPosts(params.id)
    })

    monitor.addMetadata('userDataFetched', true)
    monitor.addMetadata('postsCount', posts.length)
    monitor.end()

    return {
      user,
      posts,
      performanceMetrics: {
        totalDuration: monitor.getDuration(),
        stats: performanceTracker.getStats('fetchUserData')
      }
    }
  } catch (error) {
    const handled = handleError(error, 'UserProfilePage', {
      url: `/users/${params.id}`,
      userId: params.id
    })

    monitor.addMetadata('error', true)
    monitor.end()

    // Smart error recovery based on error type
    if (handled.category === ErrorCategory.NETWORK && handled.recoverable) {
      return {
        error: handled,
        fallback: 'cached-data', // Could show cached data
        retry: true
      }
    }

    if (handled.category === ErrorCategory.VALIDATION) {
      return {
        error: handled,
        redirect: '/users' // Redirect to users list
      }
    }

    // For critical errors, rethrow
    if (!handled.recoverable) {
      throw handled
    }

    return {
      error: handled,
      showError: true
    }
  }
}

// ============================================================================
// Example 3: Data Fetching with Retry Logic
// ============================================================================

/**
 * Fetch data with automatic retry on recoverable errors
 */
async function fetchWithRetry<T>(
  fetchFn: () => Promise<T>,
  options: {
    maxRetries?: number
    retryDelay?: number
    component?: string
  } = {}
): Promise<T> {
  const { maxRetries = 3, retryDelay = 1000, component } = options
  let lastError: any

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    const monitor = new PerformanceMonitor(`${component || 'fetchWithRetry'} (attempt ${attempt})`)

    try {
      const result = await fetchFn()
      monitor.addMetadata('success', true)
      monitor.addMetadata('attempt', attempt)
      monitor.end()
      return result
    } catch (error) {
      const handled = handleError(error, component)
      lastError = handled

      monitor.addMetadata('error', true)
      monitor.addMetadata('attempt', attempt)
      monitor.addMetadata('recoverable', handled.recoverable)
      monitor.end()

      // Only retry if error is recoverable
      if (!handled.recoverable || attempt === maxRetries) {
        throw handled
      }

      // Wait before retrying
      await new Promise(resolve => setTimeout(resolve, retryDelay * attempt))
    }
  }

  throw lastError
}

// ============================================================================
// Example 4: Form Submission with Validation
// ============================================================================

/**
 * Handle form submission with comprehensive error handling
 */
export const handleFormSubmission = withErrorHandling(
  async (formData: Record<string, any>) => {
    const monitor = new PerformanceMonitor('FormSubmission', {
      autoLog: true,
      warningThreshold: 1000
    })

    // Validation
    const validationMonitor = monitor.createChild('validation')
    const errors = validateFormData(formData)
    validationMonitor.end()

    if (errors.length > 0) {
      throw new Error(`Validation failed: ${errors.join(', ')}`)
    }

    // Submit data
    const submitMonitor = monitor.createChild('submit')
    const result = await submitToAPI(formData)
    submitMonitor.end()

    monitor.addMetadata('success', true)
    monitor.addMetadata('recordId', result.id)
    monitor.end()

    return result
  },
  'FormSubmissionHandler'
)

// ============================================================================
// Example 5: Performance Report Generation
// ============================================================================

/**
 * Generate and log performance report
 * Useful for debugging and optimization
 */
export function logPerformanceReport() {
  console.log('\n' + '='.repeat(60))
  console.log('📊 Next.js Performance Report')
  console.log('='.repeat(60))

  // Get all metrics
  const allMetrics = performanceTracker.getAllMetrics()

  for (const [name, metrics] of allMetrics) {
    const stats = performanceTracker.getStats(name)
    if (stats) {
      console.log(`\n📈 ${name}`)
      console.log(`   Calls: ${stats.count}`)
      console.log(`   Average: ${stats.average.toFixed(2)}ms`)
      console.log(`   Min: ${stats.min.toFixed(2)}ms`)
      console.log(`   Max: ${stats.max.toFixed(2)}ms`)
      console.log(`   Total: ${stats.total.toFixed(2)}ms`)
    }
  }

  console.log('\n' + '='.repeat(60))
}

/**
 * Log error statistics
 */
export function logErrorStatistics() {
  console.log('\n' + '='.repeat(60))
  console.log('🛡️ Next.js Error Statistics')
  console.log('='.repeat(60))

  const history = globalErrorHandler.getHistory()
  console.log(`\nTotal Errors: ${history.length}`)

  // Group by category
  const categories = [
    ErrorCategory.NETWORK,
    ErrorCategory.VALIDATION,
    ErrorCategory.RUNTIME,
    ErrorCategory.RENDERING
  ]

  categories.forEach(category => {
    const errors = globalErrorHandler.getErrorsByCategory(category)
    if (errors.length > 0) {
      console.log(`\n${category.toUpperCase()}: ${errors.length}`)
      errors.slice(0, 3).forEach((error: NextEnhancedError) => {
        console.log(`  - ${error.message}`)
      })
    }
  })

  console.log('\n' + '='.repeat(60))
}

// ============================================================================
// Helper Functions (Mock implementations)
// ============================================================================

async function fetchUserFromDatabase(userId: string) {
  // Mock implementation
  if (Math.random() > 0.8) {
    throw new Error('Database connection failed')
  }
  return { id: userId, name: 'John Doe', email: 'john@example.com' }
}

async function fetchUserPosts(userId: string) {
  // Mock implementation
  return [
    { id: '1', title: 'Post 1', content: 'Content 1' },
    { id: '2', title: 'Post 2', content: 'Content 2' },
  ]
}

function validateFormData(data: Record<string, any>): string[] {
  const errors: string[] = []
  if (!data.name) errors.push('Name is required')
  if (!data.email) errors.push('Email is required')
  return errors
}

async function submitToAPI(data: Record<string, any>) {
  // Mock API submission
  return { id: 'new-record', ...data }
}

// ============================================================================
// Usage in Next.js App Router
// ============================================================================

/**
 * Example: app/users/[id]/page.tsx
 */
/*
export default async function Page({ params }: { params: { id: string } }) {
  const result = await UserProfilePage({ params })

  if ('error' in result) {
    return (
      <div className="error-container">
        <h1>Error: {result.error.message}</h1>
        <p>Category: {result.error.category}</p>
        {result.error.recoverySuggestion && (
          <p className="suggestion">💡 {result.error.recoverySuggestion}</p>
        )}
        {result.error.recoverable && (
          <button onClick={() => window.location.reload()}>
            Retry
          </button>
        )}
      </div>
    )
  }

  return (
    <div>
      <h1>{result.user.name}</h1>
      <div>
        <h2>Posts</h2>
        {result.posts.map(post => (
          <article key={post.id}>
            <h3>{post.title}</h3>
            <p>{post.content}</p>
          </article>
        ))}
      </div>
      {process.env.NODE_ENV === 'development' && (
        <div className="debug-info">
          <h3>Performance Metrics</h3>
          <pre>{JSON.stringify(result.performanceMetrics, null, 2)}</pre>
        </div>
      )}
    </div>
  )
}
*/

/**
 * Example: app/api/users/[id]/route.ts
 */
/*
export async function GET(
  request: Request,
  { params }: { params: { id: string } }
) {
  const result = await getUserAPI(request, params.id)

  if (!result.success) {
    return Response.json(result.error, { 
      status: result.error.recoverable ? 400 : 500 
    })
  }

  return Response.json(result.data, {
    headers: {
      'X-Response-Time': `${result.metadata.duration}ms`
    }
  })
}
*/
