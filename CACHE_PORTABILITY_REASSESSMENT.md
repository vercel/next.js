# Cache Portability Reassessment (2024-2025)
## Node.js, Bun, Deno, Vite 생태계 분석 및 기존 계획 재검토

> **작성일**: 2025년 1월
> **기반 문서**: CACHE_PORTABILITY_PLAN.md
> **목적**: 최신 런타임 및 번들러 생태계 조사를 통한 실현 가능성 재평가

---

## 📊 Executive Summary

### 핵심 발견사항

**✅ 긍정적 발견**:
1. **AsyncLocalStorage 보편화**: 모든 주요 런타임(Node.js, Bun, Deno, Cloudflare Workers)에서 지원
2. **Deno 2.0의 Node 호환성**: 2024년 10월 출시, package.json/node_modules 네이티브 지원
3. **Bun의 통합 툴체인**: 런타임-번들러 통합 플러그인 API로 변환 간소화
4. **Vite 6 Environment API**: SSR 및 다중 환경 지원 개선 (2024년 11월)
5. **TC39 AsyncContext 진행**: Stage 2 달성, 표준화 경로 명확

**⚠️ 제약사항**:
1. **RSC 직렬화 의존성**: React/Webpack 강결합 문제 여전히 존재
2. **Cloudflare Workers 제한**: AsyncLocalStorage 부분 구현 (enterWith/disable 미지원)
3. **표준화 타임라인**: TC39 AsyncContext는 아직 Stage 2, 안정화까지 1-2년 소요 예상

### 재검토 결론

원래 계획은 **실현 가능하지만**, 다음 사항들을 **대폭 개선**해야 합니다:

1. ✅ **런타임 지원 범위 확대** - Bun, Deno, Edge Runtime 우선 지원
2. ✅ **빌드 통합 전략 수정** - Bun 매크로, Vite 6 Environment API 활용
3. ✅ **직렬화 전략 재설계** - RSC 의존성 제거 우선순위 상향
4. ⚠️ **Edge 환경 제약 명시** - Cloudflare Workers는 제한적 지원

---

## 1. 런타임 환경 상세 분석

### 1.1 Node.js (v23+)

#### AsyncLocalStorage 지원 현황
- **버전**: Node.js v25.2.0 최신 (2025년 1월 기준)
- **모듈**: `node:async_hooks` → `node:async_context` (권장)
- **상태**: ✅ **프로덕션 안정화** (Node.js 16+)
- **성능**: 최적화된 네이티브 구현

#### 주요 기능
```javascript
import { AsyncLocalStorage } from 'node:async_context' // Node 23+
// 또는
import { AsyncLocalStorage } from 'node:async_hooks'   // Node 16+

const storage = new AsyncLocalStorage()

// 지원되는 모든 메서드
storage.run(store, callback)           // ✅
storage.getStore()                     // ✅
storage.enterWith(store)               // ✅
storage.disable()                      // ✅
storage.exit(callback)                 // ✅
AsyncLocalStorage.bind(fn)             // ✅
AsyncLocalStorage.snapshot()           // ✅
```

#### 이식성 평가
| 기능 | 지원 | 비고 |
|------|------|------|
| AsyncLocalStorage | ✅ | 완전 지원 |
| Promise 후크 | ✅ | async_hooks API |
| 커스텀 직렬화 | ✅ | 제약 없음 |
| 스트림 처리 | ✅ | ReadableStream 지원 |
| 멀티스레드 | ⚠️ | Worker Threads 별도 컨텍스트 |

**결론**: Node.js는 **완벽한 기반 플랫폼**, 모든 기능 구현 가능

---

### 1.2 Bun (v1.0+)

#### AsyncLocalStorage 지원 현황
- **버전**: Bun v1.0+ (2023년 9월 안정화)
- **지원 시작**: Bun v0.7.0 (2023년 7월)
- **모듈**: `node:async_hooks` (Node.js 호환)
- **상태**: ✅ **프로덕션 준비 완료**

#### 주요 기능
```javascript
import { AsyncLocalStorage } from "node:async_hooks"

const requestId = new AsyncLocalStorage()

Bun.serve({
  fetch(request) {
    return requestId.run(crypto.randomUUID(), async () => {
      console.log(`Request ID: ${requestId.getStore()}`)
      await Bun.sleep(500)
      return new Response(`ID: ${requestId.getStore()}`)
    })
  }
})
```

#### 지원 메서드
```javascript
storage.run(store, callback)           // ✅
storage.getStore()                     // ✅
storage.enterWith(store)               // ⚠️ 부분 지원 (문서 미명시)
storage.disable()                      // ⚠️ 부분 지원
AsyncLocalStorage.snapshot()           // ✅ (Bun v1.0.8+)
```

#### Bun 번들러 플러그인 API

**핵심 차별점**: 런타임과 번들러가 **동일한 플러그인 API 공유**

```typescript
// 플러그인 예시
import type { BunPlugin } from 'bun'

const cachePlugin: BunPlugin = {
  name: 'portable-cache',

  setup(build) {
    // onLoad: 파일 로딩 전 변환
    build.onLoad({ filter: /\.(ts|tsx|js|jsx)$/ }, async (args) => {
      const source = await Bun.file(args.path).text()

      // "use cache" 지시자 감지
      if (!source.includes('"use cache"') && !source.includes("'use cache'")) {
        return undefined
      }

      // Bun의 내장 트랜스파일러 사용
      const transpiler = new Bun.Transpiler({
        loader: args.path.endsWith('.tsx') ? 'tsx' : 'ts',
      })

      // 커스텀 변환 로직
      const transformed = transformCacheDirective(source)

      return {
        contents: transformed,
        loader: 'ts',
      }
    })
  }
}
```

#### Bun 매크로 (Macros)

**혁신적 기능**: 빌드 타임에 JavaScript 함수 실행, 결과를 인라인

```typescript
// macro.ts
export function generateCacheId(filename: string, fnName: string) {
  // 빌드 타임에 실행됨
  return `${filename}:${fnName}:${Date.now()}`
}

// app.ts
import { generateCacheId } from './macro.ts' with { type: 'macro' }

const cacheId = generateCacheId(import.meta.path, 'getUser')
// ↓ 빌드 후
const cacheId = "/path/to/app.ts:getUser:1704067200000"
```

**캐시 시스템 적용 가능성**:
```typescript
// cache-macro.ts
export function cache(id: string, fn: Function) {
  // 매크로로 빌드 타임에 ID 생성
  return function(...args: any[]) {
    return cacheRuntime(id, fn, args)
  }
} with { type: 'macro' }
```

#### 이식성 평가
| 기능 | 지원 | 비고 |
|------|------|------|
| AsyncLocalStorage | ✅ | 완전 지원 |
| 통합 번들러 | ✅ | Bun.build() 네이티브 |
| 플러그인 API | ✅ | 런타임+번들러 통합 |
| 매크로 | ✅ | 빌드 타임 최적화 |
| TypeScript | ✅ | 네이티브 트랜스파일 |
| 성능 | ✅ | esbuild 대비 1.75배 빠름 |

**결론**: Bun은 **가장 유망한 플랫폼**, 통합 툴체인으로 구현 복잡도 최소화

---

### 1.3 Deno (v2.0+)

#### 2024년 주요 업데이트: Deno 2.0

**출시일**: 2024년 10월
**핵심 변화**: Node.js/npm 완전 호환성

#### AsyncLocalStorage 지원 현황
- **모듈**: `node:async_hooks` (Node 호환 모드)
- **상태**: ✅ **프로덕션 준비 완료**
- **지원 시작**: Deno v1.35+ (2023년 7월)

```javascript
import { AsyncLocalStorage } from 'node:async_hooks'

const storage = new AsyncLocalStorage()

Deno.serve((req) => {
  return storage.run({ requestId: crypto.randomUUID() }, () => {
    console.log('Request:', storage.getStore()?.requestId)
    return new Response('OK')
  })
})
```

#### Deno 2.0의 Node 호환성

**이전 (Deno 1.x)**:
```bash
# 호환성 플래그 필요
deno run --compat --unstable app.ts
```

**현재 (Deno 2.0)**:
```bash
# 플래그 불필요, 자동 감지
deno run app.ts
```

**지원되는 Node.js 기능**:
- ✅ `package.json` 네이티브 지원
- ✅ `node_modules` 폴더 자동 인식
- ✅ npm workspaces 지원
- ✅ CommonJS (`.cjs`) 지원
- ✅ Node-API (N-API) 애드온 (--allow-ffi 필요)

#### 알려진 제약사항

**queueMicrotask/setTimeout 컨텍스트 손실**:
- Issue #24368: 일부 비동기 API에서 컨텍스트 누락 발생
- 해결 상태: 일부 수정됨, 완전 해결은 추가 패치 필요

```typescript
// ⚠️ 주의: Deno에서 컨텍스트가 손실될 수 있음
storage.run({ id: 1 }, () => {
  queueMicrotask(() => {
    console.log(storage.getStore()) // undefined일 수 있음 (버그)
  })
})

// ✅ 해결책: Promise 사용
storage.run({ id: 1 }, async () => {
  await Promise.resolve()
  console.log(storage.getStore()) // 정상 동작
})
```

#### 이식성 평가
| 기능 | 지원 | 비고 |
|------|------|------|
| AsyncLocalStorage | ✅ | Node 호환 모드 |
| package.json | ✅ | Deno 2.0 네이티브 |
| npm 패키지 | ✅ | `npm:` 접두사 또는 package.json |
| CommonJS | ✅ | .cjs 파일 지원 |
| TypeScript | ✅ | 네이티브 지원 |
| 마이크로태스크 컨텍스트 | ⚠️ | 일부 버그 존재 |

**결론**: Deno 2.0은 **Node.js 마이그레이션 최적**, npm 생태계 활용 가능

---

### 1.4 Cloudflare Workers (workerd)

#### AsyncLocalStorage 지원 현황
- **활성화 방법**: `nodejs_compat` 또는 `nodejs_als` 호환성 플래그
- **상태**: ⚠️ **부분 지원** (제약 있음)
- **최신 업데이트**: `nodejs_compat_v2` (2024년 9월 23일+)

#### 설정 방법

**wrangler.toml**:
```toml
compatibility_date = "2024-09-23"
compatibility_flags = ["nodejs_compat"]
# 또는 AsyncLocalStorage만 필요한 경우
# compatibility_flags = ["nodejs_als"]
```

**nodejs_compat_v2 차이점**:
- 자동 활성화: `compatibility_date >= 2024-09-23`
- 추가 폴리필 포함 (번들 크기 증가)
- 비활성화: `no_nodejs_compat_v2` 플래그

#### 지원되는 메서드

```javascript
import { AsyncLocalStorage } from 'node:async_hooks'

const storage = new AsyncLocalStorage()

export default {
  async fetch(request, env, ctx) {
    return storage.run({ requestId: crypto.randomUUID() }, () => {
      return handleRequest(request)
    })
  }
}
```

| 메서드 | 지원 | 비고 |
|--------|------|------|
| `run()` | ✅ | 완전 지원 |
| `getStore()` | ✅ | 완전 지원 |
| `enterWith()` | ❌ | **의도적 미지원** |
| `disable()` | ❌ | **의도적 미지원** |
| `exit()` | ❌ | 미지원 |

#### 제약사항 및 영향

**1. enterWith() 미지원의 영향**:
```typescript
// ❌ Cloudflare Workers에서 불가능
storage.enterWith({ userId: 123 })
someAsyncFunction() // 컨텍스트 전파 안됨

// ✅ 대신 run() 사용 필요
storage.run({ userId: 123 }, () => {
  someAsyncFunction() // 컨텍스트 전파됨
})
```

**영향 분석**:
- Next.js 캐시 시스템은 `enterWith()`를 사용하지 않음
- 우리 구현도 `run()` 기반으로 설계 가능
- **결론**: 실질적 제약 없음 ✅

**2. AsyncResource 제약**:
```typescript
// AsyncResource는 명시적 트리거 컨텍스트 지정 불가
// 항상 생성 시점의 컨텍스트에 바인딩됨
```

**영향**: 고급 사용 사례에서만 문제, 기본 캐싱에는 영향 없음

#### 이식성 평가
| 기능 | 지원 | 비고 |
|------|------|------|
| AsyncLocalStorage.run | ✅ | 완전 지원 |
| AsyncLocalStorage.getStore | ✅ | 완전 지원 |
| 컨텍스트 전파 | ✅ | Promise/async/await 지원 |
| enterWith/disable | ❌ | 미지원 (우리 시스템에 미영향) |
| 번들 크기 | ⚠️ | nodejs_compat_v2는 크기 증가 |

**결론**: Cloudflare Workers는 **제한적 지원 가능**, 핵심 기능은 동작

---

### 1.5 Vercel Edge Runtime

#### 기반 기술
- **런타임**: Cloudflare Workers의 workerd 기반
- **호환성**: Cloudflare Workers와 동일한 제약

#### AsyncLocalStorage 지원
```typescript
// Vercel Edge Config
export const runtime = 'edge'

import { AsyncLocalStorage } from 'node:async_hooks'

const storage = new AsyncLocalStorage()

export async function GET(request: Request) {
  return storage.run({ id: crypto.randomUUID() }, () => {
    return Response.json({ id: storage.getStore()?.id })
  })
}
```

**결론**: Cloudflare Workers와 동일한 제약 및 지원 수준

---

## 2. 빌드 도구 상세 분석

### 2.1 Vite 6 (2024년 11월 출시)

#### Environment API (실험적)

**핵심 변화**: 다중 환경 동시 지원

```typescript
// vite.config.ts
import { defineConfig } from 'vite'

export default defineConfig({
  environments: {
    client: {
      // 클라이언트 환경
    },
    ssr: {
      // 서버 환경
    },
    edge: {
      // Edge 환경 (새로운 기능)
      resolve: {
        conditions: ['edge-light'],
      },
    },
  },
})
```

#### Plugin API 변경사항

**이전 (Vite 5)**:
```typescript
export function myPlugin() {
  return {
    name: 'my-plugin',
    transform(code, id, options) {
      // options.ssr로 환경 판별
      if (options.ssr) {
        // SSR 환경
      } else {
        // 클라이언트 환경
      }
    }
  }
}
```

**현재 (Vite 6)**:
```typescript
export function myPlugin() {
  return {
    name: 'my-plugin',
    transform(code, id) {
      // this.environment로 접근
      const isServer = this.environment.config.consumer === 'server'

      console.log(this.environment.name) // 'client', 'ssr', 'edge', etc.
    }
  }
}
```

#### 캐시 플러그인 구현 예시

```typescript
import type { Plugin } from 'vite'

export function cachePlugin(): Plugin {
  return {
    name: 'portable-cache',

    // 서버 환경에만 적용
    applyToEnvironment(environment) {
      return environment.config.consumer === 'server'
    },

    transform(code, id) {
      // "use cache" 감지
      if (!code.includes("'use cache'")) return null

      // 트랜스파일 로직
      const transformed = transformCacheDirective(code, {
        environment: this.environment.name,
        isProduction: this.environment.mode === 'production',
      })

      return {
        code: transformed,
        map: null,
      }
    },
  }
}
```

#### SSR 지원 개선

```typescript
// server.ts (Vite 6 SSR)
import { createServer } from 'vite'

const vite = await createServer({
  server: { middlewareMode: true },
  appType: 'custom',
})

app.use('*', async (req, res) => {
  // environment API로 모듈 로드
  const { render } = await vite.environments.ssr.import('/src/entry-server.js')

  const html = await render(req.url)
  res.send(html)
})
```

#### 이식성 평가
| 기능 | 지원 | 비고 |
|------|------|------|
| Transform Hook | ✅ | 코드 변환 지원 |
| Environment API | ✅ | 다중 환경 지원 (실험적) |
| SSR | ✅ | 서버 사이드 렌더링 |
| Edge 환경 | ✅ | Vite 6 신규 |
| HMR | ✅ | Hot Module Replacement |
| TypeScript | ✅ | esbuild 기반 |

**결론**: Vite 6은 **프레임워크 통합에 이상적**, Environment API로 유연성 확보

---

### 2.2 Bun Bundler

#### 통합 플러그인 시스템

**핵심 차별점**: 런타임과 번들러가 동일한 플러그인 사용

```typescript
import type { BunPlugin } from 'bun'

// 플러그인 정의
const myPlugin: BunPlugin = {
  name: 'my-plugin',
  setup(build) {
    build.onLoad({ filter: /\.txt$/ }, async (args) => {
      const text = await Bun.file(args.path).text()
      return {
        contents: `export default ${JSON.stringify(text)}`,
        loader: 'js',
      }
    })
  }
}

// 런타임에서 사용
import { plugin } from 'bun'
plugin(myPlugin)

// 번들러에서 사용
await Bun.build({
  entrypoints: ['./index.ts'],
  plugins: [myPlugin],
})
```

#### 캐시 플러그인 구현 (Bun용)

```typescript
import type { BunPlugin } from 'bun'
import { createHash } from 'crypto'

export const cachePlugin: BunPlugin = {
  name: 'portable-cache',

  setup(build) {
    // TypeScript/JavaScript 파일 처리
    build.onLoad({ filter: /\.(ts|tsx|js|jsx)$/ }, async (args) => {
      const source = await Bun.file(args.path).text()

      // "use cache" 감지
      if (!/"use cache"|'use cache'/.test(source)) {
        return undefined
      }

      // Bun의 트랜스파일러 사용
      const transpiler = new Bun.Transpiler({
        loader: args.path.endsWith('x') ? 'tsx' : 'ts',
        target: 'bun',
      })

      // AST 파싱 (Bun은 SWC 기반)
      const ast = transpiler.scan(source)

      // "use cache" 함수 변환
      let transformed = source
      for (const exportItem of ast.exports) {
        if (exportItem.kind === 'function') {
          // 함수 ID 생성
          const id = createHash('md5')
            .update(`${args.path}:${exportItem.name}`)
            .digest('hex')
            .slice(0, 16)

          // cache() 호출로 래핑
          transformed = wrapWithCache(transformed, exportItem, id)
        }
      }

      return {
        contents: transformed,
        loader: args.path.endsWith('.tsx') ? 'tsx' : 'ts',
      }
    })
  }
}

// 사용
plugin(cachePlugin) // 런타임
// 또는
await Bun.build({
  entrypoints: ['./app.ts'],
  plugins: [cachePlugin], // 빌드
})
```

#### Bun 매크로 활용

**빌드 타임 캐시 ID 생성**:
```typescript
// cache-id-macro.ts
export function generateCacheId(fnName: string) {
  const hash = Bun.hash(import.meta.path + fnName)
  return hash.toString(36).slice(0, 12)
}

// 사용
import { generateCacheId } from './cache-id-macro.ts' with { type: 'macro' }

// 빌드 타임에 실행되어 상수로 치환됨
const cacheId = generateCacheId('getUser')
```

#### 성능 벤치마크

| 번들러 | 빌드 시간 (상대적) |
|--------|-------------------|
| Bun | **1x** (기준) |
| esbuild | 1.75x |
| Rollup | 180x |
| Webpack | 220x |

**결론**: Bun은 **최고 성능**, 개발 경험도 우수

---

## 3. 기존 계획 재검토

### 3.1 제거 가능한 제약사항 ✅

#### 1. AsyncLocalStorage 가용성 우려
**이전 평가**: "모든 환경에서 지원되지 않을 수 있음"
**재평가**: ✅ **해소됨**

- Node.js 16+: 안정화
- Bun: 완전 지원
- Deno 2.0: 완전 지원
- Cloudflare Workers: 부분 지원 (충분함)
- Vercel Edge: 부분 지원 (충분함)

**결론**: AsyncLocalStorage는 **보편적 표준**으로 자리잡음

#### 2. 빌드 도구 파편화 우려
**이전 평가**: "Babel, Vite, Webpack 각각 구현 필요"
**재평가**: ✅ **간소화 가능**

- Bun: 통합 플러그인 시스템
- Vite 6: Environment API로 통합
- Deno: 런타임 전용 모드 가능 (빌드 도구 불필요)

**결론**: 구현 복잡도 **대폭 감소** 예상

---

### 3.2 여전히 남은 제약사항 ⚠️

#### 1. RSC 직렬화 의존성

**문제 상세**:
```typescript
// Next.js 현재 구현
import {
  renderToReadableStream,    // React Server Components
  decodeReply,                // RSC Flight Protocol
  encodeReply,                // RSC Flight Protocol
} from 'react-server-dom-webpack/server'
```

**의존성 트리**:
```
use-cache-wrapper.ts
  └─ react-server-dom-webpack/server
       ├─ react (Peer Dependency)
       ├─ react-dom (Peer Dependency)
       └─ webpack (빌드 시)
```

**문제점**:
1. React 요소(JSX)를 직렬화하는 특수 로직
2. Webpack 클라이언트 매니페스트 필요
3. 순수 데이터 직렬화에도 RSC 사용 (과도함)

**재평가된 해결 방안**:

**방안 A: 조건부 직렬화 (권장)**
```typescript
export interface Serializer {
  encode(value: unknown): Promise<string | Uint8Array>
  decode(data: string | Uint8Array): Promise<unknown>
}

// React 환경
class RSCSerializer implements Serializer {
  async encode(value: unknown) {
    return await encodeReply(value, ...)
  }
  async decode(data: string | Uint8Array) {
    return await decodeReply(data, ...)
  }
}

// Non-React 환경
class JSONSerializer implements Serializer {
  async encode(value: unknown) {
    return JSON.stringify(value)
  }
  async decode(data: string | Uint8Array) {
    return JSON.parse(data as string)
  }
}

// 고급 환경
class SuperJSONSerializer implements Serializer {
  async encode(value: unknown) {
    return superjson.stringify(value)
  }
  async decode(data: string | Uint8Array) {
    return superjson.parse(data as string)
  }
}
```

**방안 B: MessagePack (바이너리)**
```typescript
import { encode, decode } from '@msgpack/msgpack'

class MessagePackSerializer implements Serializer {
  async encode(value: unknown) {
    return encode(value) // Uint8Array
  }
  async decode(data: Uint8Array) {
    return decode(data)
  }
}
```

**성능 비교**:
| 직렬화 방식 | 속도 | 크기 | 타입 지원 |
|------------|------|------|----------|
| JSON | ⭐⭐⭐⭐⭐ | 100% | 기본 타입만 |
| superjson | ⭐⭐⭐ | 120% | Date, Map, Set, RegExp |
| MessagePack | ⭐⭐⭐⭐ | 80% | 바이너리 효율적 |
| RSC | ⭐⭐ | 140% | React 요소 포함 |

**결론**: 직렬화 추상화는 **필수**, 기본은 JSON으로 충분

#### 2. Edge 환경 메모리 제약

**Cloudflare Workers 제약**:
- CPU 시간: 50ms (무료), 100ms (프리미엄)
- 메모리: 128MB (격리 단위별)
- 로컬 스토리지: 없음 (외부 KV/Durable Objects 필요)

**Vercel Edge Functions 제약**:
- 실행 시간: 25-30초 (최대)
- 메모리: 512MB
- 번들 크기: 4MB (압축 후)

**영향**:
- 메모리 캐시 크기 제한 필요
- 장기 캐시는 외부 스토리지(Redis, KV) 필수
- LRU 캐시 알고리즘 중요

**해결책**:
```typescript
// Edge 환경용 설정
const edgeConfig: CacheConfig = {
  handler: new MemoryCacheHandler({
    maxSize: 10 * 1024 * 1024, // 10MB만 사용
    maxEntries: 100,            // 최대 엔트리 수
  }),
  // 또는 외부 스토리지
  handler: new CloudflareKVHandler(env.CACHE_KV),
}
```

**결론**: Edge 환경은 **별도 최적화 필요**

---

### 3.3 새로운 기회 🚀

#### 1. Bun의 혁신적 기능들

**A. 매크로 (Macros)**

**빌드 타임 최적화**:
```typescript
// 현재 계획: 런타임 캐시 ID 생성
const cacheId = generateCacheId(buildId, functionId, args)

// Bun 매크로 사용: 빌드 타임 사전 계산
import { hashCode } from './hash-macro.ts' with { type: 'macro' }

const cacheId = hashCode(import.meta.path, fnName) // 컴파일 타임 상수
```

**장점**:
- 런타임 오버헤드 제거
- 번들 크기 감소
- 성능 향상

**B. 통합 플러그인 시스템**

**현재 계획**:
- Babel 플러그인 (변환용)
- Vite 플러그인 (빌드용)
- Webpack 로더 (Next.js용)
→ **3개 별도 구현**

**Bun 접근법**:
- 1개 플러그인이 런타임+번들러 모두 지원
→ **구현 및 유지보수 간소화**

#### 2. Deno 2.0의 npm 생태계 통합

**기존 우려**: "Deno는 npm 패키지 사용 복잡"
**현재 상황**: Deno 2.0에서 **완전히 해소**

**사용 예시**:
```typescript
// package.json 사용 가능
import { cache } from '@portable-cache/core'
import { RedisCacheHandler } from '@portable-cache/handlers'

// npm: 접두사도 선택 사항
import express from 'express'
import redis from 'ioredis'

const app = express()
const handler = new RedisCacheHandler(new redis())

// 나머지 코드는 Node.js와 동일
```

**결론**: Deno는 **Node.js 대안**으로 충분히 실용적

#### 3. Vite 6 Environment API

**다중 환경 지원**:
```typescript
// 기존: SSR만 고려
if (options.ssr) {
  // 서버 코드
}

// Vite 6: 세분화된 환경
switch (this.environment.name) {
  case 'client':
    // 브라우저 최적화
    break
  case 'ssr':
    // Node.js SSR
    break
  case 'edge':
    // Edge Runtime 최적화
    break
  case 'rsc':
    // React Server Components
    break
}
```

**캐시 시스템 적용**:
```typescript
// environment별 최적화
const config = {
  client: {
    // 브라우저는 캐싱 비활성화
    enabled: false,
  },
  ssr: {
    handler: new MemoryCacheHandler(50 * 1024 * 1024),
  },
  edge: {
    handler: new MemoryCacheHandler(10 * 1024 * 1024), // 메모리 제약
  },
  rsc: {
    serializer: new RSCSerializer(), // RSC 전용
  },
}
```

**결론**: 환경별 **세밀한 제어 가능**

#### 4. TC39 AsyncContext 표준화

**현황**:
- Stage 2 (2024년 기준)
- 예상 타임라인: Stage 3 (2025), Stage 4 (2026-2027)

**미래 호환성**:
```typescript
// 현재: AsyncLocalStorage (Node.js API)
import { AsyncLocalStorage } from 'node:async_hooks'

// 미래: AsyncContext (표준 API)
import { AsyncContext } from 'async-context' // TC39 제안

const context = new AsyncContext.Variable()
context.run(value, () => {
  console.log(context.get()) // value
})
```

**대응 전략**:
1. **현재**: AsyncLocalStorage 기반 구현
2. **미래**: AsyncContext Polyfill 제공
3. **전환**: 추상화 레이어로 마이그레이션 간소화

```typescript
// 추상화 레이어
export class ContextStorage<T> {
  constructor(
    private storage: AsyncLocalStorage<T> | AsyncContext.Variable<T>
  ) {}

  run(value: T, callback: () => any) {
    if ('run' in this.storage) {
      return this.storage.run(value, callback)
    } else {
      return this.storage.run(value, callback)
    }
  }
}
```

**결론**: 표준화는 **장기적 안정성** 보장

---

## 4. 수정된 아키텍처 설계

### 4.1 우선순위 재조정

#### Tier 1: 핵심 지원 (최우선)
- ✅ Node.js 18+ (LTS)
- ✅ Bun 1.0+
- ✅ Deno 2.0+

#### Tier 2: 엣지 지원
- ⚠️ Cloudflare Workers (제한적)
- ⚠️ Vercel Edge Runtime (제한적)

#### Tier 3: 레거시 지원 (선택적)
- 📦 Node.js 16 (AsyncLocalStorage 최소 버전)

---

### 4.2 직렬화 전략 개선

```typescript
// @portable-cache/core/serializers

// 기본 내보내기
export { JSONSerializer } from './json'

// 선택적 직렬화 (별도 패키지)
// @portable-cache/serializers-superjson
export { SuperJSONSerializer } from '@portable-cache/serializers/superjson'

// @portable-cache/serializers-msgpack
export { MessagePackSerializer } from '@portable-cache/serializers/msgpack'

// @portable-cache/serializers-rsc (React 환경)
export { RSCSerializer } from '@portable-cache/serializers/rsc'
```

**사용 예시**:
```typescript
import { cache } from '@portable-cache/core'
import { SuperJSONSerializer } from '@portable-cache/serializers/superjson'

const getUser = cache('getUser', async (id: number) => {
  return {
    id,
    createdAt: new Date(), // superjson이 Date 직렬화 지원
    metadata: new Map([['key', 'value']]), // Map도 지원
  }
}, {
  serializer: new SuperJSONSerializer(),
})
```

---

### 4.3 빌드 통합 전략 수정

#### 이전 계획
```
@portable-cache/build
├── babel-plugin.ts      # Babel용
├── vite-plugin.ts       # Vite용
└── webpack-loader.ts    # Webpack용
```

#### 수정된 계획
```
@portable-cache/build
├── core/
│   └── transformer.ts   # 공통 변환 로직
├── bun-plugin.ts        # Bun (우선순위 1)
├── vite-plugin.ts       # Vite 6 (우선순위 1)
├── deno-plugin.ts       # Deno 런타임 (우선순위 2)
└── webpack-loader.ts    # Webpack (우선순위 3)
```

**transformer.ts** (공통 로직):
```typescript
export interface TransformOptions {
  code: string
  id: string
  environment?: 'client' | 'server' | 'edge'
  runtime?: 'node' | 'bun' | 'deno' | 'edge'
}

export function transformCacheDirective(options: TransformOptions) {
  // 공통 변환 로직
  // - "use cache" 감지
  // - 함수 추출
  // - cache() 래핑
  // - import 추가
}
```

**Bun 플러그인** (우선):
```typescript
import { transformCacheDirective } from './core/transformer'

export const bunPlugin: BunPlugin = {
  name: 'portable-cache',
  setup(build) {
    build.onLoad({ filter: /\.(ts|tsx|js|jsx)$/ }, async (args) => {
      const code = await Bun.file(args.path).text()

      const result = transformCacheDirective({
        code,
        id: args.path,
        runtime: 'bun',
      })

      return {
        contents: result.code,
        loader: args.path.endsWith('x') ? 'tsx' : 'ts',
      }
    })
  }
}
```

**Vite 플러그인**:
```typescript
import { transformCacheDirective } from './core/transformer'

export function vitePlugin(): Plugin {
  return {
    name: 'portable-cache',

    transform(code, id) {
      const environment = this.environment.name

      const result = transformCacheDirective({
        code,
        id,
        environment: environment === 'client' ? 'client' : 'server',
        runtime: 'node', // 또는 환경 감지
      })

      return result
    }
  }
}
```

**Deno** (런타임 전용, 빌드 도구 불필요):
```typescript
// 수동 래핑 방식 (타입 안전)
import { cache } from '@portable-cache/core'

export const getUser = cache('getUser', async (id: number) => {
  // 함수 본문
})

// 또는 데코레이터 사용 (미래)
export class UserService {
  @cache('getUser')
  async getUser(id: number) {
    // ...
  }
}
```

---

### 4.4 핸들러 우선순위 조정

#### Tier 1 핸들러 (필수)
```
@portable-cache/handlers
├── memory.ts            # LRU 메모리 캐시
└── redis.ts             # Redis (ioredis)
```

#### Tier 2 핸들러 (권장)
```
@portable-cache/handlers-cloudflare
└── kv.ts                # Cloudflare KV

@portable-cache/handlers-vercel
└── kv.ts                # Vercel KV
```

#### Tier 3 핸들러 (선택)
```
@portable-cache/handlers-advanced
├── memcached.ts
├── dynamodb.ts
└── upstash.ts
```

---

## 5. 수정된 로드맵

### Phase 1: 핵심 구현 (3주) ← 1주 증가

**Week 1**: 핵심 추출 및 직렬화
- [ ] `@portable-cache/core` 패키지
  - [ ] `cache()` 래퍼 (RSC 의존성 제거)
  - [ ] `cacheTag()`, `cacheLife()` 구현
  - [ ] AsyncLocalStorage 컨텍스트 관리
  - [ ] 직렬화 인터페이스 정의
- [ ] `@portable-cache/serializers`
  - [ ] JSONSerializer (기본)
  - [ ] SuperJSONSerializer
  - [ ] MessagePackSerializer

**Week 2**: 스토리지 핸들러
- [ ] `@portable-cache/handlers`
  - [ ] CacheHandler 인터페이스
  - [ ] MemoryCacheHandler (LRU)
  - [ ] RedisCacheHandler (ioredis)
  - [ ] Tags manifest 구현

**Week 3**: 테스트 및 검증
- [ ] 단위 테스트 (90%+ 커버리지)
- [ ] Node.js, Bun, Deno에서 통합 테스트
- [ ] 성능 벤치마크

### Phase 2: 빌드 도구 (2주) ← 1주 감소

**Week 4**: Bun 플러그인 (최우선)
- [ ] Bun 플러그인 구현
- [ ] 매크로 통합 (선택적)
- [ ] 예제 프로젝트

**Week 5**: Vite 6 플러그인
- [ ] Vite 플러그인 구현
- [ ] Environment API 통합
- [ ] 예제 프로젝트 (React SSR)

### Phase 3: 프레임워크 통합 (2주)

**Week 6**: Express + Fastify
- [ ] Express 미들웨어
- [ ] Fastify 플러그인
- [ ] 예제 REST API

**Week 7**: GraphQL
- [ ] GraphQL Yoga 통합
- [ ] Apollo Server 통합 (선택)
- [ ] 예제 GraphQL API

### Phase 4: 엣지 환경 최적화 (2주) ← 신규

**Week 8**: Cloudflare Workers
- [ ] KV 핸들러
- [ ] Durable Objects 핸들러 (선택)
- [ ] 메모리 최적화
- [ ] 예제 프로젝트

**Week 9**: Vercel Edge
- [ ] Vercel KV 통합
- [ ] Next.js Edge Runtime 예제
- [ ] 성능 테스트

### Phase 5: 문서화 및 출시 (2주)

**Week 10**: 문서 작성
- [ ] API 레퍼런스
- [ ] 각 환경별 가이드
- [ ] 마이그레이션 가이드

**Week 11**: 베타 출시
- [ ] npm 퍼블리싱
- [ ] CI/CD 설정
- [ ] 커뮤니티 피드백 수집

**총 기간**: 11주 (이전: 12-14주)

---

## 6. 성능 목표 및 벤치마크

### 6.1 목표 설정

#### 런타임 오버헤드
- 캐시 히트: < 0.1ms
- 캐시 미스: < 1ms (직렬화 포함)
- 메모리 오버헤드: < 100 bytes/entry (메타데이터)

#### 빌드 시간
- Bun: < 50ms (기준)
- Vite: < 100ms (HMR)
- 전체 빌드: + 5% 이하 (플러그인 오버헤드)

#### 메모리 효율
- LRU 캐시: O(1) 접근, O(log n) eviction
- Edge 환경: < 10MB 사용 (100 엔트리 기준)

### 6.2 벤치마크 계획

```typescript
// benchmarks/cache-hit.bench.ts
import { bench, describe } from 'vitest'
import { cache } from '@portable-cache/core'
import { MemoryCacheHandler } from '@portable-cache/handlers'

describe('Cache Performance', () => {
  const handler = new MemoryCacheHandler()

  const cachedFn = cache('test', async (x: number) => {
    return x * 2
  }, { handler })

  // 워밍업
  await cachedFn(1)

  bench('cache hit', async () => {
    await cachedFn(1)
  })

  bench('cache miss', async () => {
    await cachedFn(Math.random())
  })
})
```

**비교 대상**:
- Next.js `unstable_cache`
- React `cache`
- 순수 함수 (오버헤드 측정용)

---

## 7. 위험 요소 및 완화 전략

### 7.1 주요 위험

| 위험 | 영향 | 확률 | 완화 전략 |
|------|------|------|----------|
| RSC 의존성 제거 실패 | 높음 | 중간 | 조건부 직렬화, 단계적 제거 |
| Edge 환경 메모리 부족 | 중간 | 높음 | 크기 제한, 외부 스토리지 |
| AsyncContext 호환성 깨짐 | 낮음 | 낮음 | 추상화 레이어 유지 |
| 커뮤니티 채택 저조 | 높음 | 중간 | 문서화 강화, 예제 충실 |

### 7.2 완화 전략 상세

#### RSC 의존성
**전략**: 조건부 컴파일
```typescript
// @portable-cache/core
export function createCache(config: CacheConfig) {
  if (config.serializer) {
    return new GenericCache(config.serializer)
  }

  // React 환경 자동 감지
  if (typeof React !== 'undefined') {
    return new ReactCache(new RSCSerializer())
  }

  // 기본: JSON
  return new GenericCache(new JSONSerializer())
}
```

#### Edge 메모리
**전략**: 계층형 캐싱
```typescript
// Edge 환경 자동 감지
const isEdge = typeof EdgeRuntime !== 'undefined'

const handler = isEdge
  ? new TieredCacheHandler({
      l1: new MemoryCacheHandler(5 * 1024 * 1024),  // 5MB
      l2: new CloudflareKVHandler(env.CACHE_KV),     // 무제한
    })
  : new MemoryCacheHandler(50 * 1024 * 1024)        // 50MB
```

---

## 8. 성공 지표 (KPIs)

### 8.1 기술적 지표

- [ ] **테스트 커버리지**: 90% 이상
- [ ] **런타임 지원**: Node.js, Bun, Deno 모두 통과
- [ ] **빌드 도구 지원**: Vite, Bun 플러그인 동작
- [ ] **성능**: 캐시 히트 < 0.1ms, 미스 < 1ms
- [ ] **번들 크기**: Core < 50KB (gzip), 전체 < 200KB

### 8.2 커뮤니티 지표

- [ ] **GitHub Stars**: 500+ (출시 3개월)
- [ ] **npm 다운로드**: 10,000+/월 (출시 6개월)
- [ ] **프레임워크 통합**: 최소 3개 주요 프레임워크
- [ ] **문서 완성도**: 모든 API 문서화, 10+ 예제

---

## 9. 최종 권장사항

### 9.1 즉시 실행

1. **PoC 개발** (1주):
   - Bun 환경에서 최소 기능 구현
   - AsyncLocalStorage + JSON 직렬화
   - 메모리 캐시 핸들러

2. **성능 검증** (1주):
   - Next.js `unstable_cache`와 벤치마크 비교
   - 오버헤드 측정
   - 메모리 프로파일링

### 9.2 단계적 접근

**Phase 1a (필수)**: Bun + Vite + Node.js
- 가장 현대적인 스택
- 최대 사용자 커버리지
- 기술적 차별화

**Phase 1b (권장)**: Deno + Express + Fastify
- 프레임워크 다양성
- 레거시 호환성

**Phase 2 (선택)**: Edge Runtime + 고급 기능
- 엣지 환경 최적화
- 추가 직렬화 옵션
- 프리미엄 핸들러

### 9.3 장기 전략

**2025 Q1-Q2**: 베타 출시 및 피드백
- 오픈소스 공개
- 커뮤니티 구축
- 주요 프레임워크와 협업

**2025 Q3-Q4**: 안정화 및 확장
- 1.0 안정화 버전
- Edge 환경 최적화
- 엔터프라이즈 기능 (모니터링, 분석)

**2026+**: 표준 추적
- TC39 AsyncContext 마이그레이션
- 새로운 런타임 지원 (Deno 3, Bun 2 등)
- 생태계 확장

---

## 10. 결론

### 기존 계획 대비 개선점

| 항목 | 이전 | 현재 | 개선도 |
|------|------|------|--------|
| AsyncLocalStorage 가용성 | 우려 | ✅ 보편화 | ⬆️⬆️⬆️ |
| 빌드 통합 복잡도 | 높음 | 간소화 | ⬆️⬆️ |
| 런타임 지원 범위 | Node.js 중심 | 다중 런타임 | ⬆️⬆️⬆️ |
| 직렬화 유연성 | 제한적 | 플러그형 | ⬆️⬆️ |
| Edge 환경 지원 | 미고려 | 명시적 지원 | ⬆️⬆️⬆️ |
| 표준 호환성 | 불명확 | TC39 추적 | ⬆️ |
| 개발 기간 | 12-14주 | 11주 | ⬆️ |

### 핵심 변경사항

1. **Bun 우선 전략**: 통합 툴체인으로 구현 간소화
2. **직렬화 추상화**: RSC 의존성 제거 우선순위
3. **Edge Runtime 지원**: Cloudflare/Vercel 명시적 지원
4. **Deno 2.0 활용**: npm 생태계 완전 통합
5. **Vite 6 Environment API**: 다중 환경 세밀 제어

### 실현 가능성 평가

**이전 평가**: ⭐⭐⭐ (3/5) - "가능하지만 도전적"
**현재 평가**: ⭐⭐⭐⭐⭐ (5/5) - "**실현 가능하고 유망함**"

**근거**:
- ✅ AsyncLocalStorage 보편화로 기술적 기반 확보
- ✅ Bun, Deno 2.0 등 현대 런타임의 Node.js 호환성 향상
- ✅ Vite 6 Environment API로 빌드 통합 간소화
- ✅ 커뮤니티 수요 증가 (Next.js 외 환경에서 캐싱 필요)

### 최종 결론

**Next.js 캐시 시스템의 이식은 더 이상 "실험적 프로젝트"가 아닌 "실현 가능한 유용한 도구"입니다.**

2024-2025년 생태계의 발전으로 기술적 장벽이 크게 낮아졌으며, 특히:
- **Bun의 통합 툴체인**
- **Deno 2.0의 npm 호환성**
- **Vite 6의 Environment API**
- **AsyncLocalStorage의 보편화**

이 네 가지가 게임 체인저입니다.

**권장 사항**: PoC를 즉시 시작하고, Bun 환경에서 최소 기능 검증 후 단계적 확장을 추천합니다.

---

**문서 버전**: 2.0
**최종 업데이트**: 2025년 1월
