<!-- @version: next@15 -->
<!-- DO NOT APPLY THESE INSTRUCTIONS WHEN WORKING ON THE NEXT.JS REPOSITORY ITSELF -->
<!-- These instructions are for building Next.js applications, not contributing to Next.js -->

# Next.js 15+ LLM Instructions

## Core Principles

1. **App Router First** - Use App Router, TypeScript, Server Components by default
2. **Async Server Components** - Server components should be async when fetching data
3. **Server Actions for Forms** - Prefer server actions over client-side form handling
4. **Always Validate** - Validate all inputs on server, never trust client data
5. **Type Safety** - Use proper TypeScript, avoid `any`, use `unknown` when needed
6. **Performance First** - Optimize images, fonts, and bundle size. If you import components for a task, complete that task
7. **Security Conscious** - Hash passwords, use HTTPS, validate inputs
8. **SEO Friendly** - Use metadata API and semantic HTML
9. **`await` cookies/headers** - Always await `cookies()` and `headers()` in App Router
10. **Validate searchParams** - Destructure and validate from `await searchParams`
11. **No return types** - Let TypeScript infer component return types
12. **Only import existing files** - Never import files that don't exist in the project
13. **No unused variables** - Don't declare variables that aren't used, this causes linting errors
14. **No duplicate function names** - Don't create multiple functions with the same name in the same scope
15. **NEVER duplicate exports** - Each file has ONE default export, modify existing components
16. **Use Link** - Use `next/link` for internal navigation, not anchor tags
17. **Router imports** - Import from `next/navigation` (App Router), not `next/router`
18. **Check before implementing TODOs** - When encountering TODO comments about components, check if the component already exists before creating it. If it exists (even as a stub returning null), modify that existing component
19. **Modify in place** - Edit existing components by adding functionality, updating JSX, or changing function signatures. Never create duplicate functions or duplicate default exports
20. **'use client' placement** - Always place `'use client'` at the very top of the file, before any imports. Only one per file is needed
21. **Await route params** - In API route handlers, always await the `params` object to access route parameters
22. **CRITICAL: Complete the task** - If you import components for a feature (like Image for displaying photos), you MUST actually implement that feature. Don't just import and leave the task incomplete

## 1. Architecture & File Structure

### App Router (Default)

```
app/
├── layout.tsx          # Root layout (required)
├── page.tsx           # Home page
├── loading.tsx        # Loading UI
├── error.tsx          # Error boundaries
├── not-found.tsx      # 404 page
├── blog/
│   ├── page.tsx       # /blog
│   ├── layout.tsx     # Nested layout
│   └── [slug]/page.tsx # Dynamic route
├── api/
│   └── route.ts       # API routes
└── components/        # Reusable components
```

### Key Files

- `page.tsx` - Creates routes
- `layout.tsx` - Shared layouts (preserve state)
- `loading.tsx` - Loading states
- `error.tsx` - Error boundaries
- `route.ts` - API handlers
- `middleware.ts` - Request middleware

## 2. Components

### Server Components (Default)

```tsx
export default async function BlogPage() {
  const posts = await fetch('https://api.example.com/posts', {
    cache: 'force-cache',
  }).then((res) => res.json())
  return (
    <main>
      {posts.map((post) => (
        <PostCard key={post.id} post={post} />
      ))}
    </main>
  )
}
```

### Client Components

```tsx
'use client' // Must be first line, before imports
import { useState } from 'react'

export default function Counter() {
  const [count, setCount] = useState(0)
  return <button onClick={() => setCount(count + 1)}>Count: {count}</button>
}
```

**Use Client Components for:** State, event handlers, browser APIs, useEffect, custom hooks

### CRITICAL: Import vs Task Completion Disconnect

```tsx
// TODO: Display the product image and add a link to product details
// COMMON MISTAKE: Importing but not implementing the feature
import Image from 'next/image' // Imported for displaying image
import Link from 'next/link' // Imported for navigation

export default function ProductCard({ product }) {
  return (
    <div>
      <h3>{product.name}</h3>
      <p>{product.description}</p>
      {/* PROBLEM: Imported Image and Link but didn't implement the TODO! */}
      {/* No image displayed, no link added - task incomplete */}
    </div>
  )
}

// CORRECT: Actually implement what the TODO asks for
import Image from 'next/image' // Imported for displaying image
import Link from 'next/link' // Imported for navigation

export default function ProductCard({ product }) {
  return (
    <div>
      {/* IMPLEMENTED: Product image as requested */}
      <Image src={product.image} alt={product.name} width={300} height={200} />
      <h3>{product.name}</h3>
      <p>{product.description}</p>
      {/* IMPLEMENTED: Link to details as requested */}
      <Link href={`/products/${product.id}`}>View Details</Link>
    </div>
  )
}
```

### 'use client' Directive Rules

```tsx
// CORRECT: 'use client' at the very top
'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'

export default function MyComponent() {
  return <div>Client component</div>
}
```

```tsx
// WRONG: Multiple 'use client' directives
'use client'
'use client' // ERROR: Only one needed per file
import { useState } from 'react'

// WRONG: 'use client' inside component
export default function MyComponent() {
  'use client' // ERROR: Must be at file level, not inside functions
  return <div>Component</div>
}
```

**Note:** Never add return type annotations like `JSX.Element` or `React.ReactElement` to components. TypeScript infers return types automatically. Also avoid declaring variables that aren't used. Always prefer proper TypeScript types over `any`. In App Router, import navigation hooks from `next/navigation`. **CRITICAL: Each file can only have ONE default export - never create duplicate default exports, modify existing components instead by changing only the JSX content and adding functionality inside the component body.** Use `<Link />` for internal navigation, not anchor tags. When seeing TODO comments about components, check if the component already exists before creating it.

### HTML Entities in JSX

When including text content with special characters in JSX, use HTML entities to avoid rendering issues:

```tsx
export default function WelcomePage() {
  return (
    <div>
      <h1>John&apos;s Blog</h1>
      <p>Welcome to our &quot;amazing&quot; website!</p>
      <p>Copyright &copy; 2024 &amp; beyond</p>
    </div>
  )
}
```

Common HTML entities

- `&apos;` for `'` (apostrophe)
- `&quot;` for `"` (quotation mark)
- `&amp;` for `&` (ampersand)
- `&lt;` for `<` (less than)
- `&gt;` for `>` (greater than)
- `&copy;` for `©` (copyright)

## 3. Data Fetching

**CRITICAL: Use absolute URLs in Server Components, not relative URLs like `/api/posts`**

**IMPORTANT: In Next.js 15+, fetch requests are NOT cached by default. You must explicitly opt into caching.**

```tsx
// NOT cached by default in Next.js 15+
const posts = await fetch('https://api.example.com/posts') // No caching

// Explicitly cache
const cached = await fetch('https://api.example.com/posts', {
  cache: 'force-cache',
})

// Never cached
const live = await fetch('https://api.example.com/live', { cache: 'no-store' })

// Revalidated
const news = await fetch('https://api.example.com/news', {
  next: { revalidate: 60 },
})

// DON'T: Use relative URLs in Server Components
// const posts = await fetch('/api/posts') // WRONG: Will fail in production
```

## 4. Routing & Navigation

### Dynamic Routes

```tsx
// app/blog/[slug]/page.tsx
export default async function BlogPost({
  params,
}: {
  params: Promise<{ slug: string }>
}) {
  const { slug } = await params
  const post = await getPost(slug)
  return (
    <article>
      <h1>{post.title}</h1>
    </article>
  )
}
```

### Navigation

```tsx
'use client'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation' // App Router

export default function Navigation() {
  const pathname = usePathname()
  const router = useRouter()

  const handleLogout = () => {
    // Programmatic navigation in App Router
    router.push('/login')
  }

  return (
    <nav>
      {/* DO: Use Link for internal navigation */}
      <Link href="/" className={pathname === '/' ? 'active' : ''}>
        Home
      </Link>
      <Link href="/about" className={pathname === '/about' ? 'active' : ''}>
        About
      </Link>

      {/* DO: Use anchor tags only for external links */}
      <a href="https://example.com" target="_blank" rel="noopener noreferrer">
        External Link
      </a>

      <button onClick={handleLogout}>Logout</button>
    </nav>
  )
}

// DON'T: Use anchor tags for internal navigation
// <a href="/about">About</a> // WRONG: No prefetching, full page reload

// DON'T: Import from next/router (Pages Router)
// import { useRouter } from 'next/router' // WRONG for App Router
```

### Route Groups

```
app/
├── (marketing)/
│   ├── about/page.tsx     # URL: /about
│   └── layout.tsx         # Marketing layout
└── (shop)/
    ├── products/page.tsx  # URL: /products
    └── layout.tsx         # Shop layout
```

Route groups `(name)` organize files without affecting URLs. Use for team organization, multiple layouts, or feature grouping.

## 5. API Routes

API routes in the App Router are also called **Route Handlers**. They allow you to create API endpoints using the standard HTTP methods (GET, POST, PUT, DELETE, etc.) in `route.ts` or `route.js` files.

**IMPORTANT: Route parameters (`params`) must be awaited in API route handlers.**

```tsx
// app/api/users/route.ts
import { NextRequest, NextResponse } from 'next/server'

export async function GET() {
  const users = await getUsers()
  return NextResponse.json(users)
}

export async function POST(request: NextRequest) {
  const body = await request.json()
  const user = await createUser(body)
  return NextResponse.json(user, { status: 201 })
}
```

### Dynamic API Routes

```tsx
// app/api/users/[id]/route.ts
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params // CORRECT: Must await params
  const user = await getUserById(id)
  return user
    ? NextResponse.json(user)
    : NextResponse.json({ error: 'Not found' }, { status: 404 })
}

// WRONG: Accessing params without await
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = params // ERROR: params is a Promise, must await
  await deleteUser(id)
  return NextResponse.json({ success: true })
}
```

## 6. Layouts & Metadata

### Root Layout (Required)

```tsx
// app/layout.tsx
import { Inter } from 'next/font/google'

const inter = Inter({ subsets: ['latin'] })

export const metadata = {
  title: 'My App',
  description: 'My Next.js application',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en">
      <body className={inter.className}>
        <nav>Navigation</nav>
        <main>{children}</main>
      </body>
    </html>
  )
}
```

### Dynamic Metadata

```tsx
export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>
}) {
  const { slug } = await params
  const post = await getPost(slug)
  return {
    title: post.title,
    description: post.excerpt,
  }
}
```

## 7. Error Handling

```tsx
// app/error.tsx
'use client'
export default function Error({
  error,
  reset,
}: {
  error: Error
  reset: () => void
}) {
  return (
    <div>
      <h2>Something went wrong!</h2>
      <button onClick={reset}>Try again</button>
    </div>
  )
}

// app/not-found.tsx
export default function NotFound() {
  return (
    <div>
      <h2>Not Found</h2>
    </div>
  )
}
```

## 8. Forms & Server Actions

### Server Action

```ts
// app/lib/actions.ts
'use server'
import { z } from 'zod'
import { revalidatePath } from 'next/cache'

const ContactSchema = z.object({
  name: z.string().min(2),
  email: z.string().email(),
  message: z.string().min(10),
})

export async function createContact(prevState: any, formData: FormData) {
  const result = ContactSchema.safeParse({
    name: formData.get('name'),
    email: formData.get('email'),
    message: formData.get('message'),
  })

  if (!result.success) {
    return {
      error: 'Invalid input',
      fieldErrors: result.error.flatten().fieldErrors,
    }
  }

  try {
    await saveContact(result.data)
    revalidatePath('/contact')
    return { success: 'Message sent!' }
  } catch {
    return { error: 'Failed to send message' }
  }
}
```

### Form Component

```tsx
'use client'
import { useFormState, useFormStatus } from 'react-dom'
import { createContact } from '@/lib/actions'

function SubmitButton() {
  const { pending } = useFormStatus()
  return <button disabled={pending}>{pending ? 'Sending...' : 'Send'}</button>
}

export default function ContactForm() {
  const [state, formAction] = useFormState(createContact, null)

  return (
    <form action={formAction}>
      <input name="name" required />
      {state?.fieldErrors?.name && <p>{state.fieldErrors.name[0]}</p>}

      <input name="email" type="email" required />
      <textarea name="message" required />

      <SubmitButton />
      {state?.error && <p>{state.error}</p>}
      {state?.success && <p>{state.success}</p>}
    </form>
  )
}
```

## 9. Cookies & Headers

### Reading Cookies/Headers

```tsx
import { cookies, headers } from 'next/headers'

export default async function Page() {
  const cookieStore = await cookies()
  const headersList = await headers()

  const theme = cookieStore.get('theme')
  const userAgent = headersList.get('user-agent')

  return <div>Theme: {theme?.value}</div>
}
```

### Setting Cookies in Server Actions

```tsx
'use server'
import { cookies } from 'next/headers'

export async function login(formData: FormData) {
  const user = await authenticateUser(formData)

  if (user) {
    const cookieStore = await cookies()
    cookieStore.set('session', user.token, {
      httpOnly: true,
      secure: true,
      maxAge: 60 * 60 * 24 * 7, // 1 week
    })
    redirect('/dashboard')
  }

  return { error: 'Invalid credentials' }
}
```

## 10. Performance & Optimization

### Images

```tsx
import Image from 'next/image'

export default function PostCard({ post }) {
  return (
    <article>
      <Image
        src={post.image}
        alt={post.title}
        width={300}
        height={200}
        priority={post.featured}
      />
      <h3>{post.title}</h3>
    </article>
  )
}

// WRONG: Importing Image but not using it
import Image from 'next/image' // Imported but unused - WASTED IMPORT!

export default function Gallery({ photos }) {
  return (
    <div>
      {photos.map((photo) => (
        <img key={photo.id} src={photo.url} alt={photo.title} />
        // ERROR: Should use imported Image component, not img tag!
      ))}
    </div>
  )
}
```

### Fonts

```tsx
// app/layout.tsx
import { Inter } from 'next/font/google'

const inter = Inter({ subsets: ['latin'] })

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en">
      <body className={inter.className}>{children}</body>
    </html>
  )
}
```

### Loading States

```tsx
// app/loading.tsx
export default function Loading() {
  return <div className="animate-pulse">Loading...</div>
}
```

### Suspense

```tsx
// app/dashboard/page.tsx
import { Suspense } from 'react'

async function UserStats() {
  const stats = await fetch('https://api.example.com/stats').then((res) =>
    res.json()
  )
  return <div>Stats: {stats.count}</div>
}

function StatsSkeleton() {
  return <div className="animate-pulse h-20 bg-gray-200 rounded"></div>
}

export default function DashboardPage() {
  return (
    <div>
      <h1>Dashboard</h1>
      <Suspense fallback={<StatsSkeleton />}>
        <UserStats />
      </Suspense>
    </div>
  )
}
```

## 11. Configuration

```js
// next.config.js
const nextConfig = {
  experimental: { ppr: true },
  images: { domains: ['example.com'] },
}
module.exports = nextConfig
```

## 12. TypeScript Patterns

### SearchParams Pattern (IMPORTANT)

```tsx
// DON'T: Assign await searchParams to a variable
export default async function Page({ searchParams }: PageProps) {
  const searchParamsObj = await searchParams // WRONG
  const query = searchParamsObj.q // WRONG

  // This pattern is verbose and defeats the purpose
}

// DO: Destructure directly
export default async function Page({ searchParams }: PageProps) {
  const { q, category } = await searchParams // CORRECT

  // Then validate each parameter
  const query = typeof q === 'string' ? q : ''
  const validCategory = typeof category === 'string' ? category : undefined
}
```

### Page Props

```tsx
interface PageProps {
  params: Promise<{ slug: string }>
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>
}

// DO: Let TypeScript infer return type
export default async function Page({ searchParams }: PageProps) {
  const { q } = await searchParams

  // Validate search params
  const query = typeof q === 'string' ? q : ''

  const posts = await getPosts({
    query: query.trim(),
  })

  return (
    <div>
      <h1>Posts{query && ` for "${query}"`}</h1>
      {posts.map((post) => (
        <PostCard key={post.id} post={post} />
      ))}
    </div>
  )
}

// DON'T: Add unnecessary return type annotations for React Components
```

### Search Params Validation with Schema

```tsx
// For more complex validation, use a schema library like zod
import { z } from 'zod'

const SearchParamsSchema = z.object({
  q: z.string().optional(),
  category: z.enum(['tech', 'business', 'lifestyle']).optional(),
  sort: z.enum(['date', 'title', 'popularity']).default('date'),
  page: z.coerce.number().min(1).default(1),
})

export default async function Page({ searchParams }: PageProps) {
  // Parse and validate search params with schema
  const validatedParams = SearchParamsSchema.safeParse(await searchParams)

  if (!validatedParams.success) {
    // Handle validation errors or redirect
    return <div>Invalid search parameters</div>
  }

  const { q: query, category, sort, page } = validatedParams.data

  const posts = await getPosts({ query, category, sort, page })

  return (
    <div>
      <h1>Posts{query && ` for "${query}"`}</h1>
      <p>Category: {category || 'All'}</p>
      <p>Sort: {sort}</p>
      <p>Page: {page}</p>
    </div>
  )
}
```

### Component Props & Best Practices

```tsx
interface PostProps {
  post: { id: string; title: string }
  variant?: 'default' | 'featured'
}

// DO: Let TypeScript infer return types
export default function PostCard({ post, variant = 'default' }: PostProps) {
  return <article>{post.title}</article>
}

// DO: Use proper types, avoid 'any'
function handleUser(user: { id: string; name: string }) {
  return user.name // Type safe
}

// DO: Use 'unknown' when type unclear
function parseJson(str: string): unknown {
  try {
    return JSON.parse(str)
  } catch {
    return null
  }
}
```

## 13. Caching

### Fetch Caching

**IMPORTANT: In Next.js 15+, fetch requests are NOT cached by default. You must explicitly opt into caching.**

```tsx
// NOT cached by default in Next.js 15+
const posts = await fetch('https://api.example.com/posts') // No caching

// Static (cached) - must explicitly cache
const cached = await fetch('https://api.example.com/posts', {
  cache: 'force-cache',
})

// Dynamic (never cached)
const live = await fetch('https://api.example.com/live', { cache: 'no-store' })

// Revalidated
const news = await fetch('https://api.example.com/news', {
  next: { revalidate: 60 },
})

// Tag-based
const user = await fetch(`https://api.example.com/users/${id}`, {
  next: { tags: ['user', `user-${id}`] },
})
```

### `use cache` Functions

**IMPORTANT: `use cache` functions must be async and cannot use `cookies()` or `headers()`**

```tsx
'use cache'

// DO: Expensive computations
export async function getPopularPosts() {
  const posts = await fetch('https://api.example.com/posts/popular').then(
    (res) => res.json()
  )
  return posts.map((post) => ({
    ...post,
    readingTime: calculateReadingTime(post.content),
  }))
}

// DON'T: Use cookies/headers
export async function getUserPreferences(userId: string) {
  // WRONG: Cannot use cookies() in use cache functions
  // const cookieStore = await cookies()

  // CORRECT: Get from database
  return await db.userPreferences.findUnique({ where: { userId } })
}
```

### Manual Cache Management

```tsx
'use server'
import { revalidateTag, revalidatePath } from 'next/cache'

export async function updatePost(id: string, data: PostData) {
  await updatePostInDatabase(id, data)
  revalidateTag('posts')
  revalidatePath('/posts')
}
```

## 14. Component Modification Rules (CRITICAL)

**NEVER create duplicate default exports. Each file has ONE default export.**

```tsx
// WRONG: Multiple default exports
export default function Page() {
  return <div>Hello</div>
}
export default function UpdatedPage() {
  return <div>Updated</div>
} // ERROR: Duplicate default export

// WRONG: Duplicate function names
export default function Page() {
  function handleClick() {
    console.log('first')
  }

  function handleClick() {
    // ERROR: Duplicate function name
    console.log('second')
  }

  return <button onClick={handleClick}>Click</button>
}

// CORRECT: Modify existing component in place
export default function Page({ userId }: { userId: string }) {
  // CAN CHANGE: Add props to function signature
  // CAN ADD: State, handlers, effects, variables
  const [count, setCount] = useState(0)
  const [isLoading, setIsLoading] = useState(false)

  const handleSubmit = async () => {
    setIsLoading(true)
    // ... logic
    setIsLoading(false)
  }

  useEffect(() => {
    // CAN ADD: Effects and side effects
  }, [])

  return (
    <div>
      <h1>User: {userId}</h1> {/* CAN MODIFY: JSX content */}
      <button onClick={() => setCount(count + 1)}>Count: {count}</button>
      <button onClick={handleSubmit} disabled={isLoading}>
        {isLoading ? 'Loading...' : 'Submit'}
      </button>
    </div>
  )
} // CANNOT CREATE: Multiple functions with same name or multiple default exports

// When seeing TODOs: Check if component exists before creating new one
// Use existing components via imports, don't duplicate
```

### TODO Comments with Existing Stubs (CRITICAL)

<!-- prettier-ignore-start -->

```tsx
// Given file with TODO and existing stub:
// TODO: Implement ClientMeta component
// Should use 'use client' directive
// Should set title and meta description using React 19 JSX metadata

export default function ClientMeta() {
  return null // Existing stub component
}

// WRONG: Creating duplicate component
// TODO: Implement ClientMeta component
export default function ClientMeta() {
  return null
}

'use client'// WRONG: 'use client' in wrong place

export default function ClientMeta() {
  // ERROR: Duplicate default export
  return (
    <>
      <title>My Page</title>
      <meta name="description" content="Test" />
    </>
  )
}
```
<!-- prettier-ignore-end -->

```tsx
// CORRECT: Modify the existing component
'use client' // CORRECT: At the top

// TODO: Implement ClientMeta component - DONE
export default function ClientMeta() {
  return (
    <>
      <title>My Page</title>
      <meta name="description" content="Test" />
    </>
  )
}
```

### Imported Components Must Be Used

```tsx
// TODO: Create a card component with image and Link to details page
import Image from 'next/image'
import Link from 'next/link'

// WRONG: Imported but not used
export default function ProductCard({ product }) {
  return (
    <div>
      <img src={product.image} alt={product.name} /> {/* Should use Image */}
      <h3>{product.name}</h3>
      <a href={`/products/${product.id}`}>View Details</a>{' '}
      {/* Should use Link */}
    </div>
  )
}

// CORRECT: Using imported components
export default function ProductCard({ product }) {
  return (
    <div>
      <Image src={product.image} alt={product.name} width={300} height={200} />
      <h3>{product.name}</h3>
      <Link href={`/products/${product.id}`}>View Details</Link>
    </div>
  )
}
```

## 15. Best Practices Summary

### Component Patterns

```tsx
// Early returns for error states
export default async function UserProfile({ userId }: { userId: string }) {
  const user = await getUser(userId)
  if (!user) return <div>User not found</div>

  return (
    <div>
      <h1>{user.name}</h1>
    </div>
  )
}

// Logical AND for conditionals
{
  isLoading && <div>Loading...</div>
}
{
  error && <div>Error: {error.message}</div>
}

// Composition pattern
interface PageHeaderProps {
  title: string
  children?: React.ReactNode
}

export function PageHeader({ title, children }: PageHeaderProps) {
  return (
    <div>
      <h1>{title}</h1>
      {children}
    </div>
  )
}
```

## Summary

This guide covers Next.js 15+ essentials:

1. **App Router First** - Use App Router, TypeScript, Server Components by default
2. **Proper Caching** - fetch requests are NOT cached by default in Next.js 15+, must explicitly opt-in
3. **Component Rules** - Never create duplicate default exports, modify existing components in place
4. **Type Safety** - Use proper TypeScript patterns, validate searchParams
5. **Server Actions** - Prefer server actions for forms with proper validation
