# Next.js Cache System Portability Plan

## 목차
1. [개요](#개요)
2. [현재 구현 분석](#현재-구현-분석)
3. [핵심 관심사 분리](#핵심-관심사-분리)
4. [이식 가능한 아키텍처 설계](#이식-가능한-아키텍처-설계)
5. [구현 로드맵](#구현-로드맵)
6. [사용 예시](#사용-예시)

---

## 개요

Next.js의 캐시 시스템(`"use cache"`, `cacheTag`, `cacheLife`)을 순수 Node.js 환경(Express, Fastify + GraphQL Yoga) 및 다른 번들러(Vite)에서 사용할 수 있도록 이식 가능한 패키지로 추출하는 계획입니다.

### 목표
- ✅ Next.js 외부 환경에서 캐시 기능 사용 가능
- ✅ Express, Fastify, GraphQL 서버 지원
- ✅ Vite 등 다양한 번들러 지원
- ✅ 플러그형 스토리지 백엔드 (메모리, Redis, etc.)
- ✅ 타입 안정성 유지

---

## 현재 구현 분석

### 1. 핵심 파일 구조

#### 캐시 래퍼 (`use-cache-wrapper.ts` - 1,689 lines)
**위치**: `packages/next/src/server/use-cache/use-cache-wrapper.ts`

**주요 책임**:
- `cache()` 함수: "use cache" 함수를 래핑
- 캐시 키 생성: `[buildId, functionId, args, hmrHash?]`
- RSC 직렬화/역직렬화 (React Server Components)
- 캐시 엔트리 생성 및 수집
- Resume Data Cache 통합
- 사전 렌더링 처리 (Prerender, PPR)

**주요 의존성**:
```typescript
// React Server Components
import { renderToReadableStream, decodeReply, encodeReply } from 'react-server-dom-webpack/server'
import { createFromReadableStream } from 'react-server-dom-webpack/client'

// Next.js 컨텍스트
import { workAsyncStorage } from '../app-render/work-async-storage.external'
import { workUnitAsyncStorage } from '../app-render/work-unit-async-storage.external'

// 캐시 핸들러
import { getCacheHandler } from './handlers'
```

#### 캐시 태그 (`cache-tag.ts`)
**위치**: `packages/next/src/server/use-cache/cache-tag.ts`

**기능**:
```typescript
export function cacheTag(...tags: string[]): void {
  const workUnitStore = workUnitAsyncStorage.getStore()
  // "use cache" 함수 내에서만 호출 가능 검증
  // 태그를 workUnitStore.tags에 추가
}
```

#### 캐시 수명 (`cache-life.ts`)
**위치**: `packages/next/src/server/use-cache/cache-life.ts`

**기능**:
```typescript
export type CacheLife = {
  stale?: number      // 클라이언트 캐시 시간
  revalidate?: number // 서버 재검증 빈도
  expire?: number     // 최대 유효 기간
}

export function cacheLife(profile: string | CacheLife): void {
  // 명시적 캐시 수명 설정
  // workUnitStore에 explicitRevalidate/explicitExpire/explicitStale 설정
}
```

프로필 예시:
- `default`: 기본 재검증
- `seconds`, `minutes`, `hours`, `days`, `weeks`: 시간 기반
- `max`: 최대 캐시 시간

#### 캐시 핸들러 인터페이스 (`cache-handlers/types.ts`)
**위치**: `packages/next/src/server/lib/cache-handlers/types.ts`

**핵심 타입**:
```typescript
export interface CacheEntry {
  value: ReadableStream<Uint8Array>  // 캐시된 데이터 스트림
  tags: string[]                      // 명시적 태그
  stale: number                       // 클라이언트 캐시 시간 (초)
  timestamp: number                   // 생성 시간 (ms)
  expire: number                      // 만료 시간 (초)
  revalidate: number                  // 재검증 시간 (초)
}

export interface CacheHandler {
  get(cacheKey: string, softTags: string[]): Promise<undefined | CacheEntry>
  set(cacheKey: string, pendingEntry: Promise<CacheEntry>): Promise<void>
  refreshTags(): Promise<void>
  getExpiration(tags: string[]): Promise<number>
  updateTags(tags: string[], durations?: { expire?: number }): Promise<void>
}
```

#### 기본 캐시 핸들러 (`cache-handlers/default.ts`)
**위치**: `packages/next/src/server/lib/cache-handlers/default.ts`

**구현**:
- LRU 메모리 캐시
- 태그 기반 만료/재검증
- 스트림 복제 (tee) 관리
- 오류 재시도 로직

#### 재검증 API (`revalidate.ts`)
**위치**: `packages/next/src/server/web/spec-extension/revalidate.ts`

**주요 함수**:
```typescript
// 태그 기반 재검증
export function revalidateTag(tag: string, profile: string | CacheLifeConfig)

// 경로 기반 재검증
export function revalidatePath(path: string, type?: 'layout' | 'page')

// 서버 액션용 태그 업데이트
export function updateTag(tag: string)

// 클라이언트 캐시 새로고침
export function refresh()
```

### 2. 주요 관심사

#### A. 직렬화 레이어
**현재**: React Server Components (RSC) Flight Protocol
- `encodeReply()`: 인자를 FormData/String으로 직렬화
- `decodeReply()`: 직렬화된 데이터를 객체로 복원
- `renderToReadableStream()`: React 요소를 스트림으로 렌더링
- `createFromReadableStream()`: 스트림을 React 요소로 복원

**문제점**:
- RSC는 React 및 Webpack에 강하게 결합됨
- Next.js의 클라이언트 매니페스트 필요
- React 요소를 직렬화하는 특수 로직

**해결 방안**:
- 플러그형 직렬화 어댑터 인터페이스
- 기본: JSON 직렬화 (일반적인 사용 사례)
- 고급: superjson, devalue 등 사용자 정의 직렬화

#### B. 컨텍스트 관리
**현재**: AsyncLocalStorage 기반
```typescript
workAsyncStorage.getStore() // WorkStore (빌드 설정, 경로 정보)
workUnitAsyncStorage.getStore() // WorkUnitStore (요청/캐시 컨텍스트)
```

**사용처**:
- 캐시 스코프 판별 (request, prerender, cache)
- 태그 및 수명 정보 저장
- HMR 해시, Draft Mode 등 Next.js 특정 기능

**해결 방안**:
- 최소한의 컨텍스트 인터페이스 정의
- AsyncLocalStorage 기반 구현 제공
- 사용자 정의 컨텍스트 제공자 지원

#### C. 빌드 통합
**현재**: Webpack 로더
- `next-flight-loader`: "use cache" 지시자를 감지하고 함수를 래핑
- 각 함수에 고유 ID 할당
- 클라이언트 매니페스트 생성

**해결 방안**:
- Babel/SWC 플러그인으로 변환 로직 추출
- Vite 플러그인 제공
- Webpack 플러그인 제공
- 런타임 전용 모드 (수동 래핑)

#### D. Next.js 특정 개념
**제거/단순화 필요**:
- ✅ Prerendering (SSG) → 선택적 기능
- ✅ PPR (Partial Prerendering) → 제거
- ✅ Draft Mode → 제거 또는 선택적
- ✅ HMR refresh hash → 개발 모드 선택적
- ✅ Build ID → 배포 버전 관리로 일반화
- ✅ Dynamic rendering detection → 제거

---

## 핵심 관심사 분리

### 레이어 아키텍처

```
┌─────────────────────────────────────────────────┐
│          Application Layer                      │
│  (Express, Fastify, Vite, etc.)                 │
└─────────────────────────────────────────────────┘
                    ↓
┌─────────────────────────────────────────────────┐
│          Cache Directive Layer                  │
│  - cache() wrapper                              │
│  - cacheTag(), cacheLife() APIs                 │
└─────────────────────────────────────────────────┘
                    ↓
┌─────────────────────────────────────────────────┐
│          Serialization Adapter                  │
│  - JSON (default)                               │
│  - superjson, devalue (plugins)                 │
└─────────────────────────────────────────────────┘
                    ↓
┌─────────────────────────────────────────────────┐
│          Cache Storage Layer                    │
│  - CacheHandler interface                       │
│  - Memory (LRU), Redis, etc.                    │
└─────────────────────────────────────────────────┘
                    ↓
┌─────────────────────────────────────────────────┐
│          Tag Management Layer                   │
│  - Tags manifest                                │
│  - Revalidation tracking                        │
└─────────────────────────────────────────────────┘
```

---

## 이식 가능한 아키텍처 설계

### 1. 패키지 구조

```
@portable-cache/
├── core/                 # 핵심 캐시 로직
│   ├── cache.ts         # cache() 래퍼
│   ├── cache-tag.ts     # cacheTag() 구현
│   ├── cache-life.ts    # cacheLife() 구현
│   ├── context.ts       # 컨텍스트 관리
│   ├── types.ts         # 공통 타입
│   └── serializers/
│       ├── json.ts      # JSON 직렬화
│       └── interface.ts # 직렬화 인터페이스
│
├── handlers/             # 스토리지 백엔드
│   ├── memory.ts        # 메모리 (LRU)
│   ├── redis.ts         # Redis
│   ├── types.ts         # CacheHandler 인터페이스
│   └── tags.ts          # 태그 관리
│
├── integrations/         # 프레임워크 통합
│   ├── express/
│   │   ├── middleware.ts
│   │   └── index.ts
│   ├── fastify/
│   │   ├── plugin.ts
│   │   └── index.ts
│   └── graphql/
│       ├── yoga.ts
│       └── index.ts
│
├── build/                # 빌드 도구
│   ├── babel-plugin.ts  # Babel 플러그인
│   ├── vite-plugin.ts   # Vite 플러그인
│   └── webpack-loader.ts # Webpack 로더
│
└── revalidate/           # 재검증 API
    ├── api.ts           # revalidateTag, revalidatePath
    └── types.ts
```

### 2. 핵심 API 설계

#### `@portable-cache/core`

```typescript
// types.ts
export interface CacheEntry {
  value: Buffer | string  // 직렬화된 데이터
  tags: string[]
  stale: number
  timestamp: number
  expire: number
  revalidate: number
}

export interface CacheHandler {
  get(cacheKey: string, softTags: string[]): Promise<undefined | CacheEntry>
  set(cacheKey: string, entry: CacheEntry): Promise<void>
  refreshTags(): Promise<void>
  getExpiration(tags: string[]): Promise<number>
  updateTags(tags: string[], durations?: { expire?: number }): Promise<void>
}

export interface Serializer {
  encode(value: unknown): Promise<string | Buffer>
  decode(data: string | Buffer): Promise<unknown>
}

export interface CacheContext {
  tags: string[]
  revalidate: number
  expire: number
  stale: number
  version?: string  // buildId 대체
}

export interface CacheConfig {
  handler: CacheHandler
  serializer?: Serializer
  version?: string
  cacheLifeProfiles?: Record<string, CacheLife>
}

// cache.ts
import { AsyncLocalStorage } from 'async_hooks'

const cacheContextStorage = new AsyncLocalStorage<CacheContext>()

export function cache<T extends (...args: any[]) => Promise<any>>(
  id: string,
  fn: T,
  config: CacheConfig
): T {
  return (async (...args: any[]) => {
    // 1. 캐시 컨텍스트 생성
    const context: CacheContext = {
      tags: [],
      revalidate: config.cacheLifeProfiles?.default?.revalidate ?? 300,
      expire: config.cacheLifeProfiles?.default?.expire ?? Infinity,
      stale: config.cacheLifeProfiles?.default?.stale ?? 60,
    }

    return cacheContextStorage.run(context, async () => {
      // 2. 캐시 키 생성
      const serializer = config.serializer ?? defaultJSONSerializer
      const encodedArgs = await serializer.encode(args)
      const version = config.version ?? 'v1'
      const cacheKey = `${version}:${id}:${encodedArgs}`

      // 3. 캐시 조회
      const cached = await config.handler.get(cacheKey, [])
      const currentTime = Date.now()

      if (cached) {
        // 만료 체크
        if (currentTime <= cached.timestamp + cached.expire * 1000) {
          // 재검증 체크
          const needsRevalidation =
            currentTime > cached.timestamp + cached.revalidate * 1000

          if (needsRevalidation) {
            // 백그라운드 재검증
            regenerateInBackground(id, fn, args, cacheKey, config)
          }

          // 캐시된 값 반환
          return serializer.decode(cached.value)
        }
      }

      // 4. 캐시 미스 - 새로 생성
      const startTime = Date.now()
      const result = await fn(...args)
      const serializedValue = await serializer.encode(result)

      // 5. 캐시 엔트리 생성
      const entry: CacheEntry = {
        value: serializedValue,
        tags: context.tags,
        timestamp: startTime,
        revalidate: context.revalidate,
        expire: context.expire,
        stale: context.stale,
      }

      // 6. 캐시 저장
      await config.handler.set(cacheKey, entry)

      return result
    })
  }) as T
}

// cache-tag.ts
export function cacheTag(...tags: string[]): void {
  const context = cacheContextStorage.getStore()
  if (!context) {
    throw new Error('cacheTag() can only be called inside a cached function')
  }
  context.tags.push(...tags)
}

// cache-life.ts
export type CacheLife = {
  stale?: number
  revalidate?: number
  expire?: number
}

export function cacheLife(profile: string | CacheLife): void {
  const context = cacheContextStorage.getStore()
  if (!context) {
    throw new Error('cacheLife() can only be called inside a cached function')
  }

  // 프로필 또는 직접 값 적용
  if (typeof profile === 'string') {
    // config에서 프로필 조회 필요 - 글로벌 설정 참조
    throw new Error('Profile-based cacheLife requires global config')
  } else {
    if (profile.stale !== undefined) context.stale = profile.stale
    if (profile.revalidate !== undefined) context.revalidate = profile.revalidate
    if (profile.expire !== undefined) context.expire = profile.expire
  }
}
```

#### `@portable-cache/handlers`

```typescript
// memory.ts
import { LRUCache } from './lru-cache'

export class MemoryCacheHandler implements CacheHandler {
  private cache: LRUCache<CacheEntry>
  private tagsManifest: Map<string, { expired: number; stale: number }>

  constructor(maxSize: number = 50 * 1024 * 1024) {
    this.cache = new LRUCache(maxSize, (entry) =>
      Buffer.byteLength(entry.value)
    )
    this.tagsManifest = new Map()
  }

  async get(cacheKey: string, softTags: string[]): Promise<CacheEntry | undefined> {
    const entry = this.cache.get(cacheKey)
    if (!entry) return undefined

    // 태그 만료 체크
    const now = Date.now()
    for (const tag of entry.tags) {
      const tagInfo = this.tagsManifest.get(tag)
      if (tagInfo && entry.timestamp <= tagInfo.expired) {
        return undefined // 태그가 만료됨
      }
    }

    return entry
  }

  async set(cacheKey: string, entry: CacheEntry): Promise<void> {
    this.cache.set(cacheKey, entry)
  }

  async refreshTags(): Promise<void> {
    // 메모리 핸들러는 no-op
  }

  async getExpiration(tags: string[]): Promise<number> {
    let maxExpiration = 0
    for (const tag of tags) {
      const info = this.tagsManifest.get(tag)
      if (info) {
        maxExpiration = Math.max(maxExpiration, info.expired)
      }
    }
    return maxExpiration
  }

  async updateTags(tags: string[], durations?: { expire?: number }): Promise<void> {
    const now = Date.now()
    for (const tag of tags) {
      this.tagsManifest.set(tag, {
        expired: durations?.expire
          ? now + durations.expire * 1000
          : now,
        stale: now,
      })
    }
  }
}

// redis.ts
import { Redis } from 'ioredis'

export class RedisCacheHandler implements CacheHandler {
  constructor(private redis: Redis) {}

  async get(cacheKey: string, softTags: string[]): Promise<CacheEntry | undefined> {
    const data = await this.redis.get(`cache:${cacheKey}`)
    if (!data) return undefined

    const entry = JSON.parse(data) as CacheEntry

    // 태그 만료 체크
    for (const tag of entry.tags) {
      const expiration = await this.redis.get(`tag:${tag}:expired`)
      if (expiration && entry.timestamp <= parseInt(expiration)) {
        return undefined
      }
    }

    return entry
  }

  async set(cacheKey: string, entry: CacheEntry): Promise<void> {
    const ttl = entry.expire === Infinity ? 0 : entry.expire
    const data = JSON.stringify(entry)

    if (ttl > 0) {
      await this.redis.setex(`cache:${cacheKey}`, ttl, data)
    } else {
      await this.redis.set(`cache:${cacheKey}`, data)
    }
  }

  async updateTags(tags: string[], durations?: { expire?: number }): Promise<void> {
    const now = Date.now()
    const pipeline = this.redis.pipeline()

    for (const tag of tags) {
      pipeline.set(`tag:${tag}:expired`, now.toString())
      if (durations?.expire) {
        pipeline.expire(`tag:${tag}:expired`, durations.expire)
      }
    }

    await pipeline.exec()
  }

  // ... 나머지 메서드
}
```

#### `@portable-cache/integrations/express`

```typescript
// middleware.ts
import { AsyncLocalStorage } from 'async_hooks'
import type { Request, Response, NextFunction } from 'express'

export interface ExpressCacheOptions {
  handler: CacheHandler
  version?: string
  cacheLifeProfiles?: Record<string, CacheLife>
}

export function createCacheMiddleware(options: ExpressCacheOptions) {
  return (req: Request, res: Response, next: NextFunction) => {
    // 요청별 컨텍스트 설정
    req.cacheConfig = options

    // 재검증 API 추가
    req.revalidateTag = async (tag: string) => {
      await options.handler.updateTags([tag])
    }

    next()
  }
}

// 사용 예시
import express from 'express'
import { cache, cacheTag } from '@portable-cache/core'
import { MemoryCacheHandler } from '@portable-cache/handlers'
import { createCacheMiddleware } from '@portable-cache/integrations/express'

const app = express()
const cacheHandler = new MemoryCacheHandler()

app.use(createCacheMiddleware({
  handler: cacheHandler,
  version: 'v1',
  cacheLifeProfiles: {
    default: { stale: 60, revalidate: 300, expire: 3600 },
    frequent: { stale: 10, revalidate: 60, expire: 300 },
  }
}))

// "use cache" 함수 정의
const getUser = cache('getUser', async (id: number) => {
  'use cache'
  cacheTag('user', `user:${id}`)

  const user = await db.users.findById(id)
  return user
}, req.cacheConfig)

app.get('/users/:id', async (req, res) => {
  const user = await getUser(parseInt(req.params.id))
  res.json(user)
})
```

#### `@portable-cache/integrations/fastify`

```typescript
// plugin.ts
import fp from 'fastify-plugin'
import type { FastifyPluginAsync } from 'fastify'

export interface FastifyCacheOptions {
  handler: CacheHandler
  version?: string
  cacheLifeProfiles?: Record<string, CacheLife>
}

const cachePlugin: FastifyPluginAsync<FastifyCacheOptions> = async (
  fastify,
  options
) => {
  fastify.decorate('cacheConfig', options)

  fastify.decorateRequest('revalidateTag', async function(tag: string) {
    await options.handler.updateTags([tag])
  })

  fastify.decorateRequest('revalidatePath', async function(path: string) {
    const tag = `_N_T_${path}`
    await options.handler.updateTags([tag])
  })
}

export default fp(cachePlugin, {
  name: '@portable-cache/fastify',
  fastify: '4.x'
})

// 사용 예시
import Fastify from 'fastify'
import cachePlugin from '@portable-cache/integrations/fastify'
import { cache, cacheTag } from '@portable-cache/core'
import { RedisCacheHandler } from '@portable-cache/handlers'

const fastify = Fastify()
const redis = new Redis()

await fastify.register(cachePlugin, {
  handler: new RedisCacheHandler(redis),
  version: process.env.APP_VERSION,
})

const getProduct = cache('getProduct', async (id: string) => {
  cacheTag('product', `product:${id}`)
  return await db.products.findById(id)
}, fastify.cacheConfig)

fastify.get('/products/:id', async (request, reply) => {
  const product = await getProduct(request.params.id)
  return product
})
```

#### `@portable-cache/integrations/graphql`

```typescript
// yoga.ts
import { createYoga } from 'graphql-yoga'
import { cache, cacheTag, cacheLife } from '@portable-cache/core'

export function createCachedYogaServer(options: {
  schema: any
  handler: CacheHandler
  version?: string
}) {
  const yoga = createYoga({
    schema: options.schema,
    context: ({ request }) => ({
      cacheConfig: {
        handler: options.handler,
        version: options.version,
      }
    })
  })

  return yoga
}

// 사용 예시 - GraphQL 리졸버
import { createSchema } from 'graphql-yoga'

const getPost = cache('getPost', async (id: string) => {
  cacheTag('post', `post:${id}`)
  cacheLife({ revalidate: 60, expire: 300, stale: 30 })

  return await db.posts.findById(id)
})

const schema = createSchema({
  typeDefs: /* GraphQL */ `
    type Query {
      post(id: ID!): Post
    }
    type Post {
      id: ID!
      title: String!
    }
  `,
  resolvers: {
    Query: {
      post: async (_, { id }, context) => {
        return await getPost(id)
      }
    }
  }
})

const yoga = createCachedYogaServer({
  schema,
  handler: new RedisCacheHandler(redis)
})
```

#### `@portable-cache/build/vite-plugin`

```typescript
// vite-plugin.ts
import type { Plugin } from 'vite'
import { transformAsync } from '@babel/core'
import babelPluginCache from './babel-plugin'

export interface ViteCachePluginOptions {
  include?: string[]
  exclude?: string[]
}

export function cachePlugin(options: ViteCachePluginOptions = {}): Plugin {
  return {
    name: 'portable-cache',

    async transform(code, id) {
      // TypeScript/JavaScript 파일만 처리
      if (!/\.(tsx?|jsx?)$/.test(id)) return null

      // "use cache" 지시자 확인
      if (!code.includes("'use cache'") && !code.includes('"use cache"')) {
        return null
      }

      // Babel로 변환
      const result = await transformAsync(code, {
        plugins: [babelPluginCache],
        filename: id,
        sourceMaps: true,
      })

      return {
        code: result?.code ?? code,
        map: result?.map,
      }
    },
  }
}

// vite.config.ts 사용 예시
import { defineConfig } from 'vite'
import { cachePlugin } from '@portable-cache/build/vite-plugin'

export default defineConfig({
  plugins: [
    cachePlugin({
      include: ['src/**/*.ts'],
    })
  ]
})
```

#### `@portable-cache/build/babel-plugin`

```typescript
// babel-plugin.ts
import type { PluginObj, NodePath } from '@babel/core'
import * as t from '@babel/types'
import { createHash } from 'crypto'

export default function cachePlugin(): PluginObj {
  return {
    name: 'portable-cache-transform',

    visitor: {
      FunctionDeclaration(path: NodePath<t.FunctionDeclaration>) {
        transformCachedFunction(path, path.node.id?.name ?? 'anonymous')
      },

      FunctionExpression(path: NodePath<t.FunctionExpression>) {
        // 변수에 할당된 함수 찾기
        const parent = path.parent
        if (t.isVariableDeclarator(parent) && t.isIdentifier(parent.id)) {
          transformCachedFunction(path, parent.id.name)
        }
      },

      ArrowFunctionExpression(path: NodePath<t.ArrowFunctionExpression>) {
        const parent = path.parent
        if (t.isVariableDeclarator(parent) && t.isIdentifier(parent.id)) {
          transformCachedFunction(path, parent.id.name)
        }
      },
    },
  }
}

function transformCachedFunction(
  path: NodePath<t.Function>,
  name: string
) {
  const body = path.node.body

  // "use cache" 지시자 확인
  if (!t.isBlockStatement(body)) return
  if (body.body.length === 0) return

  const firstStatement = body.body[0]
  if (
    !t.isExpressionStatement(firstStatement) ||
    !t.isStringLiteral(firstStatement.expression) ||
    firstStatement.expression.value !== 'use cache'
  ) {
    return
  }

  // "use cache" 지시자 제거
  body.body.shift()

  // 고유 ID 생성 (파일 경로 + 함수 이름 기반)
  const filename = path.hub.file.opts.filename ?? 'unknown'
  const id = createHash('md5')
    .update(`${filename}:${name}`)
    .digest('hex')
    .slice(0, 16)

  // cache() 호출로 래핑
  // 원본: async function getUser(id) { 'use cache'; return ... }
  // 변환: const getUser = cache('abc123', async function(id) { return ... })

  const originalFunction = t.cloneNode(path.node)

  const cacheCall = t.callExpression(
    t.identifier('cache'),
    [
      t.stringLiteral(id),           // 함수 ID
      originalFunction,               // 원본 함수
      t.identifier('cacheConfig'),    // 설정 객체
    ]
  )

  // 함수 선언을 변수 선언으로 변경
  if (path.isFunctionDeclaration()) {
    const variableDeclaration = t.variableDeclaration('const', [
      t.variableDeclarator(t.identifier(name), cacheCall),
    ])
    path.replaceWith(variableDeclaration)
  } else {
    path.replaceWith(cacheCall)
  }

  // cache 임포트 추가
  const program = path.findParent((p) => p.isProgram())
  if (program && program.isProgram()) {
    const hasImport = program.node.body.some(
      (node) =>
        t.isImportDeclaration(node) &&
        node.source.value === '@portable-cache/core'
    )

    if (!hasImport) {
      const importDeclaration = t.importDeclaration(
        [t.importSpecifier(t.identifier('cache'), t.identifier('cache'))],
        t.stringLiteral('@portable-cache/core')
      )
      program.node.body.unshift(importDeclaration)
    }
  }
}
```

### 3. 재검증 API

```typescript
// @portable-cache/revalidate
import type { CacheHandler } from '@portable-cache/handlers'

let globalHandler: CacheHandler | undefined

export function setGlobalCacheHandler(handler: CacheHandler) {
  globalHandler = handler
}

export async function revalidateTag(tag: string, profile?: CacheLifeConfig) {
  if (!globalHandler) {
    throw new Error('Cache handler not initialized')
  }

  const durations = profile ? { expire: profile.expire } : undefined
  await globalHandler.updateTags([tag], durations)
}

export async function revalidatePath(path: string, type?: 'page' | 'layout') {
  const tag = type ? `_N_T_${path}/${type}` : `_N_T_${path}`
  await revalidateTag(tag)
}

export async function updateTag(tag: string) {
  // 즉시 만료 (expire: 0)
  await revalidateTag(tag, { expire: 0 })
}
```

---

## 구현 로드맵

### Phase 1: 핵심 추출 (2-3주)
- [ ] `@portable-cache/core` 패키지 생성
  - [ ] 최소 컨텍스트 인터페이스 정의
  - [ ] `cache()` 래퍼 구현 (Next.js에서 추출)
  - [ ] `cacheTag()`, `cacheLife()` 구현
  - [ ] JSON 직렬화 구현
  - [ ] 타입 정의 완성

- [ ] `@portable-cache/handlers` 패키지
  - [ ] `CacheHandler` 인터페이스 정의
  - [ ] LRU 캐시 유틸리티 추출
  - [ ] `MemoryCacheHandler` 구현
  - [ ] Tags manifest 구현

- [ ] 단위 테스트 작성
  - [ ] 캐시 키 생성 테스트
  - [ ] 직렬화/역직렬화 테스트
  - [ ] 태그 관리 테스트
  - [ ] 수명 주기 테스트

### Phase 2: 스토리지 백엔드 (2주)
- [ ] Redis 핸들러 구현
  - [ ] ioredis 통합
  - [ ] 태그 기반 만료
  - [ ] 스트림 처리 최적화

- [ ] 기타 백엔드 (선택적)
  - [ ] Memcached
  - [ ] DynamoDB
  - [ ] Cloudflare KV

- [ ] 통합 테스트
  - [ ] Redis 연동 테스트
  - [ ] 동시성 테스트
  - [ ] 재검증 시나리오 테스트

### Phase 3: 프레임워크 통합 (3주)
- [ ] Express 통합
  - [ ] 미들웨어 구현
  - [ ] 재검증 API 바인딩
  - [ ] 예제 프로젝트

- [ ] Fastify 통합
  - [ ] 플러그인 구현
  - [ ] 데코레이터 추가
  - [ ] 예제 프로젝트

- [ ] GraphQL (Yoga) 통합
  - [ ] 컨텍스트 통합
  - [ ] 리졸버 헬퍼
  - [ ] 예제 프로젝트

### Phase 4: 빌드 도구 (3-4주)
- [ ] Babel 플러그인
  - [ ] "use cache" 감지 및 변환
  - [ ] 함수 ID 생성
  - [ ] cache() 호출 래핑

- [ ] Vite 플러그인
  - [ ] Babel 통합
  - [ ] HMR 지원
  - [ ] 예제 프로젝트

- [ ] Webpack 로더 (선택적)
  - [ ] Next.js 호환성
  - [ ] 예제 프로젝트

### Phase 5: 문서화 및 배포 (2주)
- [ ] API 문서
  - [ ] 핵심 API 레퍼런스
  - [ ] 각 통합별 가이드
  - [ ] 마이그레이션 가이드

- [ ] 예제 및 튜토리얼
  - [ ] Express + REST API
  - [ ] Fastify + GraphQL
  - [ ] Vite + React
  - [ ] 프로덕션 배포 가이드

- [ ] NPM 배포
  - [ ] 패키지 설정
  - [ ] CI/CD 파이프라인
  - [ ] 버전 관리

---

## 사용 예시

### Express REST API

```typescript
// server.ts
import express from 'express'
import { cache, cacheTag, cacheLife } from '@portable-cache/core'
import { MemoryCacheHandler } from '@portable-cache/handlers'
import { createCacheMiddleware, revalidateTag } from '@portable-cache/integrations/express'

const app = express()
const cacheHandler = new MemoryCacheHandler(50 * 1024 * 1024) // 50MB

// 캐시 미들웨어
app.use(createCacheMiddleware({
  handler: cacheHandler,
  version: process.env.APP_VERSION,
  cacheLifeProfiles: {
    default: { stale: 60, revalidate: 300, expire: 3600 },
    frequent: { stale: 10, revalidate: 60, expire: 300 },
    longterm: { stale: 3600, revalidate: 86400, expire: 604800 },
  }
}))

// 캐시된 함수 정의
const getUser = cache('getUser', async (userId: number) => {
  cacheTag('user', `user:${userId}`)
  cacheLife('frequent')

  console.log(`Fetching user ${userId}...`)
  const user = await db.users.findById(userId)
  return user
})

const getUserPosts = cache('getUserPosts', async (userId: number) => {
  cacheTag('user-posts', `user:${userId}`, `posts`)

  const posts = await db.posts.findByUserId(userId)
  return posts
})

// 라우트
app.get('/users/:id', async (req, res) => {
  const user = await getUser(parseInt(req.params.id))
  if (!user) return res.status(404).json({ error: 'User not found' })

  res.json(user)
})

app.get('/users/:id/posts', async (req, res) => {
  const posts = await getUserPosts(parseInt(req.params.id))
  res.json(posts)
})

// 재검증 API
app.post('/users/:id/invalidate', async (req, res) => {
  const userId = req.params.id

  await revalidateTag(`user:${userId}`)
  await revalidateTag(`user-posts`)

  res.json({ message: 'Cache invalidated' })
})

app.listen(3000)
```

### Fastify + GraphQL Yoga

```typescript
// server.ts
import Fastify from 'fastify'
import { createYoga } from 'graphql-yoga'
import { createSchema } from 'graphql-yoga'
import cachePlugin from '@portable-cache/integrations/fastify'
import { RedisCacheHandler } from '@portable-cache/handlers'
import { cache, cacheTag, cacheLife } from '@portable-cache/core'
import Redis from 'ioredis'

const redis = new Redis()
const fastify = Fastify({ logger: true })

// 캐시 플러그인 등록
await fastify.register(cachePlugin, {
  handler: new RedisCacheHandler(redis),
  version: '1.0.0',
  cacheLifeProfiles: {
    default: { stale: 30, revalidate: 300, expire: 3600 },
  }
})

// GraphQL 리졸버에서 사용할 캐시 함수
const getProduct = cache('getProduct', async (id: string) => {
  cacheTag('product', `product:${id}`)
  cacheLife({ revalidate: 60, expire: 300, stale: 30 })

  return await db.products.findById(id)
})

const getProducts = cache('getProducts', async (category?: string) => {
  cacheTag('products', category ? `category:${category}` : 'all')

  if (category) {
    return await db.products.findByCategory(category)
  }
  return await db.products.findAll()
})

// GraphQL 스키마
const schema = createSchema({
  typeDefs: /* GraphQL */ `
    type Product {
      id: ID!
      name: String!
      price: Float!
      category: String!
    }

    type Query {
      product(id: ID!): Product
      products(category: String): [Product!]!
    }

    type Mutation {
      updateProduct(id: ID!, name: String, price: Float): Product
    }
  `,

  resolvers: {
    Query: {
      product: async (_, { id }) => {
        return await getProduct(id)
      },

      products: async (_, { category }) => {
        return await getProducts(category)
      },
    },

    Mutation: {
      updateProduct: async (_, { id, name, price }, context) => {
        const product = await db.products.update(id, { name, price })

        // 캐시 무효화
        await context.request.revalidateTag(`product:${id}`)
        await context.request.revalidateTag('products')

        return product
      },
    },
  },
})

// GraphQL Yoga 서버
const yoga = createYoga({
  schema,
  graphqlEndpoint: '/graphql',
  context: ({ request }) => ({ request })
})

fastify.route({
  url: '/graphql',
  method: ['GET', 'POST', 'OPTIONS'],
  handler: async (req, reply) => {
    const response = await yoga.handleNodeRequest(req, {
      req,
      reply,
    })

    response.headers.forEach((value, key) => {
      reply.header(key, value)
    })

    reply.status(response.status)
    reply.send(response.body)
  }
})

await fastify.listen({ port: 4000 })
```

### Vite + React (클라이언트 사이드 GraphQL)

```typescript
// vite.config.ts
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { cachePlugin } from '@portable-cache/build/vite-plugin'

export default defineConfig({
  plugins: [
    react(),
    cachePlugin({
      include: ['src/api/**/*.ts'],
    })
  ]
})

// src/api/products.ts
import { cache, cacheTag } from '@portable-cache/core'

// "use cache" 지시자로 자동 변환됨
export async function getProducts(category?: string) {
  'use cache'
  cacheTag('products', category ? `category:${category}` : 'all')

  const response = await fetch(`/api/products?category=${category}`)
  return response.json()
}

export async function getProduct(id: string) {
  'use cache'
  cacheTag('product', `product:${id}`)

  const response = await fetch(`/api/products/${id}`)
  return response.json()
}

// src/components/ProductList.tsx
import { useQuery } from '@tanstack/react-query'
import { getProducts } from '../api/products'

export function ProductList({ category }: { category?: string }) {
  const { data: products } = useQuery({
    queryKey: ['products', category],
    queryFn: () => getProducts(category)
  })

  return (
    <div>
      {products?.map(product => (
        <div key={product.id}>{product.name}</div>
      ))}
    </div>
  )
}
```

---

## 테스트 전략

### 1. 단위 테스트

```typescript
// __tests__/cache.test.ts
import { describe, it, expect, beforeEach } from 'vitest'
import { cache, cacheTag, cacheLife } from '@portable-cache/core'
import { MemoryCacheHandler } from '@portable-cache/handlers'

describe('cache()', () => {
  let handler: MemoryCacheHandler

  beforeEach(() => {
    handler = new MemoryCacheHandler()
  })

  it('should cache function results', async () => {
    let callCount = 0

    const fn = cache('test', async (x: number) => {
      callCount++
      return x * 2
    }, { handler })

    expect(await fn(5)).toBe(10)
    expect(callCount).toBe(1)

    expect(await fn(5)).toBe(10)
    expect(callCount).toBe(1) // 캐시됨, 재호출 안됨
  })

  it('should support cache tags', async () => {
    const fn = cache('test', async (id: string) => {
      cacheTag('user', `user:${id}`)
      return { id, name: 'Test' }
    }, { handler })

    await fn('1')

    // 태그로 무효화
    await handler.updateTags(['user:1'])

    // 캐시 미스 발생
    const result = await handler.get('v1:test:["1"]', [])
    expect(result).toBeUndefined()
  })

  it('should respect cache life settings', async () => {
    const fn = cache('test', async () => {
      cacheLife({ revalidate: 10, expire: 60, stale: 5 })
      return Math.random()
    }, { handler })

    const result1 = await fn()

    // 즉시 재호출 - 캐시 히트
    const result2 = await fn()
    expect(result1).toBe(result2)
  })
})
```

### 2. 통합 테스트

```typescript
// __tests__/integration/express.test.ts
import request from 'supertest'
import express from 'express'
import { cache, cacheTag } from '@portable-cache/core'
import { MemoryCacheHandler } from '@portable-cache/handlers'
import { createCacheMiddleware } from '@portable-cache/integrations/express'

describe('Express Integration', () => {
  it('should cache API responses', async () => {
    const app = express()
    const handler = new MemoryCacheHandler()

    app.use(createCacheMiddleware({ handler }))

    let callCount = 0
    const getData = cache('getData', async (id: string) => {
      callCount++
      return { id, value: Math.random() }
    }, { handler })

    app.get('/data/:id', async (req, res) => {
      const data = await getData(req.params.id)
      res.json(data)
    })

    // 첫 요청
    const res1 = await request(app).get('/data/123')
    expect(callCount).toBe(1)

    // 두 번째 요청 - 캐시됨
    const res2 = await request(app).get('/data/123')
    expect(callCount).toBe(1)
    expect(res1.body).toEqual(res2.body)
  })
})
```

---

## 마이그레이션 가이드

### Next.js에서 Portable Cache로 마이그레이션

**Before (Next.js):**
```typescript
// app/api/users/route.ts
import { cacheTag, cacheLife } from 'next/cache'

export async function GET(request: Request) {
  async function getUsers() {
    'use cache'
    cacheTag('users')
    cacheLife('frequent')

    return await db.users.findAll()
  }

  const users = await getUsers()
  return Response.json(users)
}
```

**After (Express + Portable Cache):**
```typescript
// server.ts
import express from 'express'
import { cache, cacheTag, cacheLife } from '@portable-cache/core'
import { MemoryCacheHandler } from '@portable-cache/handlers'
import { createCacheMiddleware } from '@portable-cache/integrations/express'

const app = express()
app.use(createCacheMiddleware({
  handler: new MemoryCacheHandler(),
  cacheLifeProfiles: {
    frequent: { stale: 10, revalidate: 60, expire: 300 }
  }
}))

const getUsers = cache('getUsers', async () => {
  cacheTag('users')
  cacheLife('frequent')

  return await db.users.findAll()
}, app.cacheConfig)

app.get('/api/users', async (req, res) => {
  const users = await getUsers()
  res.json(users)
})
```

---

## 성능 고려사항

### 1. 직렬화 최적화
- **JSON**: 가장 빠르지만 Date, Map, Set 등 제한적
- **superjson**: 더 많은 타입 지원하지만 느림
- **MessagePack**: 바이너리 형식으로 빠르고 작음

### 2. 스트리밍 vs 버퍼링
- Next.js는 RSC 스트림 사용
- Portable Cache는 기본적으로 완전히 버퍼링
- 선택적으로 스트리밍 지원 가능 (Redis Streams 등)

### 3. 캐시 키 생성
- 빠른 해시 알고리즘 사용 (xxhash, murmur3)
- 인자 직렬화 캐싱
- 고정 길이 키 사용

### 4. 메모리 관리
- LRU 캐시 크기 제한
- 자동 eviction 정책
- 메모리 사용량 모니터링

---

## 보안 고려사항

### 1. 캐시 키 충돌 방지
- 함수 ID에 파일 경로 포함
- 네임스페이스 지원
- 버전 관리

### 2. 민감한 데이터 처리
- 캐시 범위 제어 (public vs private)
- 특정 태그는 캐시 불가
- 암호화된 캐시 지원

### 3. 재검증 권한
- API 키 기반 재검증
- Rate limiting
- 감사 로그

---

## 결론

이 계획은 Next.js의 강력한 캐시 시스템을 다른 Node.js 환경으로 이식할 수 있는 실질적인 로드맵을 제시합니다. 핵심 관심사를 분리하고, 플러그형 아키텍처를 채택하며, 프레임워크별 통합을 제공함으로써 광범위한 사용 사례를 지원할 수 있습니다.

### 주요 장점
1. ✅ **프레임워크 독립적**: Express, Fastify, 순수 Node.js 모두 지원
2. ✅ **플러그형 스토리지**: 메모리, Redis 등 자유롭게 선택
3. ✅ **타입 안정성**: 완전한 TypeScript 지원
4. ✅ **개발자 경험**: "use cache" 지시자로 간단한 사용
5. ✅ **프로덕션 준비**: 태그 기반 재검증, 수명 관리

### 다음 단계
1. 커뮤니티 피드백 수집
2. PoC (Proof of Concept) 구현
3. 벤치마크 및 성능 테스트
4. 오픈소스 프로젝트 론칭

이 문서는 살아있는 문서이며, 구현 과정에서 계속 업데이트될 것입니다.
