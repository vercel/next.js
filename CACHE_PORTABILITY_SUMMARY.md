# Cache Portability Investigation - Executive Summary

> **조사 기간**: 2025년 1월
> **관련 문서**:
> - [원본 계획서](./CACHE_PORTABILITY_PLAN.md)
> - [재검토 보고서](./CACHE_PORTABILITY_REASSESSMENT.md)

---

## 📊 핵심 요약

### 조사 목적
Next.js의 캐시 시스템(`"use cache"`, `cacheTag`, `cacheLife`)을 순수 Node.js 환경 및 다른 런타임(Bun, Deno)과 번들러(Vite)로 이식 가능성 평가

### 최종 결론

**✅ 실현 가능성: 높음 (5/5)**

2024-2025년 JavaScript 생태계의 발전으로 기술적 장벽이 크게 낮아졌으며, 특히 AsyncLocalStorage의 보편화와 Bun/Deno의 Node.js 호환성 향상이 게임 체인저입니다.

---

## 🔍 주요 발견사항

### 1. AsyncLocalStorage 보편화

| 런타임 | 지원 상태 | 버전 | 비고 |
|--------|----------|------|------|
| Node.js | ✅ 완전 지원 | v16+ | 프로덕션 안정화 |
| Bun | ✅ 완전 지원 | v0.7.0+ | 2023년 7월부터 |
| Deno | ✅ 완전 지원 | v1.35+ | Node 호환 모드 |
| Cloudflare Workers | ⚠️ 부분 지원 | - | nodejs_compat 플래그 필요 |
| Vercel Edge | ⚠️ 부분 지원 | - | workerd 기반 |

**영향**: 컨텍스트 전파의 기술적 기반 확보

### 2. Deno 2.0의 Node.js 호환성 (2024년 10월)

**이전**:
```bash
deno run --compat --unstable app.ts
```

**현재**:
```bash
deno run app.ts  # 플래그 불필요
```

**지원 기능**:
- ✅ `package.json` 네이티브 인식
- ✅ `node_modules` 자동 처리
- ✅ npm workspaces
- ✅ CommonJS (`.cjs`)
- ✅ Node-API 애드온

**영향**: Deno가 Node.js의 실질적 대안으로 부상

### 3. Bun의 통합 툴체인

**핵심 차별점**: 런타임과 번들러가 **동일한 플러그인 API** 공유

```typescript
const plugin: BunPlugin = {
  name: 'cache-plugin',
  setup(build) { /* ... */ }
}

// 런타임
import { plugin } from 'bun'
plugin(cachePlugin)

// 번들러
await Bun.build({
  plugins: [cachePlugin]
})
```

**영향**: 빌드 통합 복잡도 대폭 감소

### 4. Vite 6 Environment API (2024년 11월)

**이전**:
```typescript
transform(code, id, options) {
  if (options.ssr) { /* 서버 */ }
}
```

**현재**:
```typescript
transform(code, id) {
  const env = this.environment.name
  // 'client', 'ssr', 'edge', 'rsc' 등
}
```

**영향**: 환경별 세밀한 최적화 가능

### 5. TC39 AsyncContext 표준화

- **현재 단계**: Stage 2 (2024)
- **예상 타임라인**: Stage 3 (2025), Stage 4 (2026-2027)
- **영향**: 장기적 안정성 및 표준 호환성 보장

---

## 📋 기존 계획 vs 재검토 비교

| 항목 | 원본 계획 | 재검토 후 | 변경 |
|------|----------|----------|------|
| **실현 가능성** | ⭐⭐⭐ (3/5) | ⭐⭐⭐⭐⭐ (5/5) | ⬆️⬆️ |
| **AsyncLocalStorage 가용성** | "우려됨" | "보편화됨" | ✅ |
| **빌드 통합 복잡도** | 높음 | 간소화 | ⬆️⬆️ |
| **지원 런타임** | Node.js 중심 | 다중 런타임 | ⬆️⬆️⬆️ |
| **Edge 환경** | 미고려 | 명시적 지원 | ⬆️⬆️⬆️ |
| **개발 기간** | 12-14주 | 11주 | ⬆️ |

### 주요 변경사항

#### 1. 우선순위 재조정

**이전**:
```
1. Node.js + Express
2. Fastify
3. GraphQL
4. Vite
```

**현재**:
```
Tier 1 (핵심):
- Node.js 18+
- Bun 1.0+
- Deno 2.0+

Tier 2 (엣지):
- Cloudflare Workers
- Vercel Edge Runtime
```

#### 2. 빌드 통합 전략

**이전**:
- Babel 플러그인
- Vite 플러그인
- Webpack 로더
→ **3개 별도 구현**

**현재**:
- **공통 transformer 코어**
- Bun 플러그인 (우선)
- Vite 플러그인 (우선)
- Webpack 로더 (레거시)
→ **코어 공유, 구현 간소화**

#### 3. 직렬화 전략

**이전**:
- JSON (기본)
- superjson (선택)
- RSC (React 환경)

**현재**:
- **RSC 의존성 제거 최우선**
- JSON (기본, 대부분 충분)
- superjson (Date, Map, Set 필요 시)
- MessagePack (바이너리 효율)
- RSC (React 전용 별도 패키지)

#### 4. 새로운 기회 추가

| 기술 | 활용 방안 |
|------|----------|
| **Bun Macros** | 빌드 타임 캐시 ID 생성 |
| **Vite 6 Env API** | 환경별 세밀 제어 |
| **Deno 2.0 npm** | npm 생태계 완전 접근 |
| **TC39 AsyncContext** | 미래 표준 호환성 |

---

## 🚀 수정된 로드맵

### Phase 1: 핵심 구현 (3주) ← +1주
- Week 1: 직렬화 추상화 (RSC 제거)
- Week 2: 스토리지 핸들러
- Week 3: 테스트 및 검증

### Phase 2: 빌드 도구 (2주) ← -1주
- Week 4: **Bun 플러그인** (최우선)
- Week 5: Vite 6 플러그인

### Phase 3: 프레임워크 통합 (2주)
- Week 6: Express + Fastify
- Week 7: GraphQL (Yoga, Apollo)

### Phase 4: 엣지 환경 (2주) ← **신규**
- Week 8: Cloudflare Workers 최적화
- Week 9: Vercel Edge 통합

### Phase 5: 문서화 및 출시 (2주)
- Week 10: 문서 작성
- Week 11: 베타 출시

**총 기간**: 11주 (이전: 12-14주)

---

## ⚠️ 주요 제약사항

### 1. Cloudflare Workers 제한

| 기능 | 지원 |
|------|------|
| `AsyncLocalStorage.run()` | ✅ |
| `AsyncLocalStorage.getStore()` | ✅ |
| `AsyncLocalStorage.enterWith()` | ❌ |
| `AsyncLocalStorage.disable()` | ❌ |

**영향**: 제한적이지만 핵심 기능 동작 가능 (우리 구현은 `run()` 기반)

### 2. Edge 환경 메모리 제약

| 환경 | 메모리 | CPU 시간 |
|------|--------|----------|
| Cloudflare Workers | 128MB | 50-100ms |
| Vercel Edge | 512MB | 25-30초 |

**대응**: 메모리 캐시 크기 제한, 외부 스토리지(KV, Redis) 권장

### 3. RSC 직렬화 의존성

**문제**: Next.js는 React Server Components Flight Protocol 사용

**해결책**:
- 조건부 직렬화 (React 환경 자동 감지)
- 기본은 JSON (대부분 충분)
- RSC는 별도 패키지로 분리

---

## 💡 핵심 권장사항

### 즉시 실행

1. **PoC 개발 (1주)**
   - Bun 환경에서 최소 기능 구현
   - AsyncLocalStorage + JSON 직렬화
   - 메모리 LRU 캐시

2. **성능 검증 (1주)**
   - Next.js `unstable_cache`와 벤치마크
   - 오버헤드 측정 (목표: 히트 < 0.1ms, 미스 < 1ms)

### 단계적 접근

```
Phase 1a (필수) → Bun + Vite + Node.js
    ↓
Phase 1b (권장) → Deno + Express + Fastify
    ↓
Phase 2 (선택) → Edge Runtime + 고급 기능
```

### 장기 전략

- **2025 Q1-Q2**: 베타 출시, 커뮤니티 피드백
- **2025 Q3-Q4**: 1.0 안정화, Edge 최적화
- **2026+**: TC39 AsyncContext 마이그레이션

---

## 📈 성공 지표 (KPIs)

### 기술적 목표
- ✅ 테스트 커버리지 90%+
- ✅ 런타임 지원: Node.js, Bun, Deno
- ✅ 성능: 캐시 히트 < 0.1ms
- ✅ 번들 크기: Core < 50KB (gzip)

### 커뮤니티 목표
- 🎯 GitHub Stars: 500+ (3개월)
- 🎯 npm 다운로드: 10,000+/월 (6개월)
- 🎯 프레임워크 통합: 3개 이상

---

## 🎯 최종 결론

### 기존 계획의 타당성

**재확인**: 원본 계획은 기술적으로 올바른 방향이었으며, 2024-2025년 생태계 발전으로 실현 가능성이 **크게 향상**됨

### 주요 성공 요인

1. ✅ **AsyncLocalStorage 보편화** - 모든 주요 런타임 지원
2. ✅ **Bun의 통합 툴체인** - 구현 복잡도 감소
3. ✅ **Deno 2.0 Node 호환성** - npm 생태계 활용
4. ✅ **Vite 6 Environment API** - 환경별 최적화
5. ✅ **TC39 표준화 진행** - 미래 호환성

### 실행 권장도

**강력 권장 (Go)**

이 프로젝트는:
- ✅ 기술적으로 실현 가능
- ✅ 커뮤니티 수요 존재
- ✅ 생태계 타이밍 최적
- ✅ 차별화 가치 명확

**다음 단계**: Bun 기반 PoC 즉시 시작 → 성능 검증 → 단계적 확장

---

## 📚 참고 자료

### 공식 문서
- [Node.js AsyncLocalStorage](https://nodejs.org/api/async_context.html)
- [Bun Runtime APIs](https://bun.sh/docs/runtime)
- [Deno Node Compatibility](https://docs.deno.com/runtime/fundamentals/node/)
- [Vite 6 Environment API](https://vite.dev/guide/api-environment)
- [TC39 AsyncContext Proposal](https://github.com/tc39/proposal-async-context)

### Next.js 캐시 구현
- `packages/next/src/server/use-cache/use-cache-wrapper.ts` (1,689 lines)
- `packages/next/src/server/use-cache/cache-tag.ts`
- `packages/next/src/server/use-cache/cache-life.ts`
- `packages/next/src/server/lib/cache-handlers/types.ts`

### 테스트 케이스
- `test/e2e/app-dir/use-cache/use-cache.test.ts`
- 50+ 통합 테스트 존재

---

**문서 버전**: 1.0
**최종 업데이트**: 2025년 1월
**작성자**: Claude (AI Assistant)
**검토 필요**: 커뮤니티 피드백
