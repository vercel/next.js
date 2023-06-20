Next.js 문서 기여 가이드에 오신 것을 환영합니다! 여러분을 만나게 되어 기쁩니다.

이 페이지는 Next.js 문서를 편집하는 방법에 대한 지침을 제공합니다. 우리의 목표는 커뮤니티의 모든 사람이 문서를 기여하고 개선할 수 있는 권한을 갖도록 하는 것입니다.

## 왜 기여해야 하나요?

오픈소스 작업은 결코 끝나지 않으며 문서화 역시 마찬가지입니다. 문서에 기여하는 것은 초보자가 오픈소스에 참여할 수 있는 좋은 방법이며, 숙련된 개발자는 커뮤니티와 지식을 공유하면서 더 복잡한 주제를 명확히 할 수 있는 좋은 방법입니다.

Next.js 문서에 기여함으로써 모든 개발자를 위한 더욱 강력한 학습 리소스를 구축하는 데 도움을 주실 수 있습니다. 오타나 혼란스러운 섹션을 발견했거나 특정 주제가 누락된 것을 발견했더라도 여러분의 기여를 환영하고 감사하게 생각합니다.

## 기여하는 방법

문서 콘텐츠는 [Next.js 레포지토리](https://github.com/vercel/next.js/tree/canary/docs)에서 찾을 수 있습니다. 기여하려면 GitHub에서 직접 파일을 편집하거나 리포지토리를 복제하여 로컬에서 파일을 편집할 수 있습니다.

### GitHub Workflow

GitHub를 처음 사용하는 경우 [GitHub 오픈 소스 가이드](https://opensource.guide/how-to-contribute/#opening-a-pull-request)를 읽고 레포지토리 포크, 브랜치 생성 및 풀 리퀘스트 제출 방법을 알아보는 것이 좋습니다.

> **알아두면 좋은 점**: 기본 문서 코드는 비공개 코드베이스에 있으며, 이 코드베이스는 Next.js 공개 레포지토리에 동기화됩니다. 즉, 로컬에서 문서를 미리 볼 수 없습니다. 그러나 풀 리퀘스트를 병합한 후에는 [nextjs.org](https://nextjs.org/docs)에서 변경 사항을 볼 수 있습니다.

### MDX 작성

문서는 JSX 구문을 지원하는 마크다운 형식인 [MDX](https://mdxjs.com/)로 작성되었습니다. 이를 통해 문서에 React 컴포넌트를 포함할 수 있습니다. 마크다운 구문에 대한 간략한 개요는 [GitHub 마크다운 가이드](https://docs.github.com/en/get-started/writing-on-github/getting-started-with-writing-and-formatting-on-github/basic-writing-and-formatting-syntax)를 참조하세요.

### VSCode

#### 로컬에서 변경 사항 미리보기

VSCode에는 편집 내용을 로컬에서 확인하는 데 사용할 수 있는 마크다운 미리 보기가 내장되어 있습니다. MDX 파일에 대해 미리 보기를 사용하려면 사용자 설정에 구성 옵션을 추가해야 합니다.

명령 팔레트(`Mac의 경우 ⌘ + ⇧ + P, Windows의 경우 Ctrl + Shift + P`)를 열고 `Preferences: Open User Settings (JSON)`을 검색합니다.

그런 다음 `settings.json` 파일에 다음 줄을 추가합니다:

```json filename="settings.json"
{
  "files.associations": {
    "*.mdx": "markdown"
  }
}
```

그런 다음 명령 팔레트를 다시 열고 `Markdown: Preview File` 또는 `Markdown: Open Preview to the Side`을 검색합니다. 그러면 형식이 지정된 변경 내용을 확인할 수 있는 미리보기 창이 열립니다.

#### 익스텐션

또한 VSCode 사용자에게는 다음 확장 프로그램을 권장합니다:

- [MDX](https://marketplace.visualstudio.com/items?itemName=unifiedjs.vscode-mdx): MDX용 인텔리센스 및 구문 강조 표시.
- [Grammarly](https://marketplace.visualstudio.com/items?itemName=znck.grammarly): 문법 및 맞춤법 검사
- [Prettier](https://marketplace.visualstudio.com/items?itemName=esbenp.prettier-vscode): 저장시 MDX 포맷에 맞춰 저장

### 검토 프로세스

기여를 제출하면 Next.js 또는 개발자 경험 팀에서 변경 사항을 검토하고 피드백을 제공하며 풀 리퀘스트가 준비되면 병합합니다.

궁금한 점이 있거나 PR 의견에 추가 지원이 필요한 경우 알려주시기 바랍니다. Next.js 문서에 기여하고 커뮤니티의 일원이 되어 주셔서 감사합니다!

> **Tip:** PR을 제출하기 전에 `pnpm prettier-fix`를 실행하여 Prettier를 실행하세요.

## 파일 구조

문서에서는 **파일 시스템 라우팅**을 사용합니다. [`/docs`](/vercel/next.js/tree/canary/docs) 내부의 각 폴더와 파일은 하나의 경로 세그먼트를 나타냅니다. 이러한 세그먼트는 URL 경로, 탐색 및 이동 경로를 생성하는 데 사용됩니다.

파일 구조는 사이트에 표시되는 탐색을 반영하며 기본적으로 탐색 항목은 알파벳순으로 정렬됩니다. 그러나 폴더 또는 파일 이름 앞에 두 자리 숫자(00-)를 추가하여 항목의 순서를 변경할 수 있습니다.

예를 들어 [함수 API 레퍼런스](/docs/app/api-reference/functions)에서는 개발자가 특정 함수를 쉽게 찾을 수 있도록 페이지가 알파벳순으로 정렬되어 있습니다:

```txt
03-functions
├── cookies.mdx
├── draft-mode.mdx
├── fetch.mdx
└── ...
```

그러나 [라우팅 섹션](/docs/app/building-your-application/routing)에서는 파일 앞에 두 자리 숫자가 붙어서 개발자가 이러한 개념을 익혀야 하는 순서대로 정렬되어 있습니다:

```txt
02-routing
├── 01-defining-routes.mdx
├── 02-pages-and-layouts.mdx
├── 03-linking-and-navigating.mdx
└── ...
```

페이지를 빠르게 찾으려면 `⌘ + P`(Mac) 또는 `Ctrl + P`(Windows)를 사용하여 VSCode에서 검색창을 열 수 있습니다. 그런 다음 찾고 있는 페이지의 슬러그를 입력합니다. 예: `defining-routes`

> **왜 매니페스트를 사용하지 않나요?**
>
> 문서 탐색을 생성하는 또 다른 인기 있는 방법인 매니페스트 파일 사용을 고려했지만 매니페스트가 파일과 빠르게 동기화되지 않는다는 것을 알게 되었습니다. 파일 시스템 라우팅은 문서의 구조에 대해 생각하게 하고 Next.js에 더 네이티브한 느낌을 줍니다.

## 메타데이터

각 페이지에는 파일 상단에 대시 세 개로 구분된 메타데이터 블록이 있습니다.

### 필수 항목

다음 필드는 **필수** 입력 사항입니다:

| 항목          | 설명                                                                   |
| ------------- | ---------------------------------------------------------------------- |
| `title`       | SEO 및 OG 이미지에 사용되는 페이지의 `<h1>` 제목입니다.                |
| `description` | SEO용 `<meta name="description">` 태그에 사용되는 페이지의 설명입니다. |

```yaml filename="required-fields.mdx"
---
tile: 페이지 제목
description: 페이지 설명
---
```

페이지 제목은 2~3단어(예: 이미지 최적화)로, 설명은 1~2문장(예: Next.js에서 이미지를 최적화하는 방법 배우기)으로 제한하는 것이 좋습니다.

### 선택 항목

다음 필드는 **선택** 사항입니다:

| 항목        | 설명                                                                                                                               |
| ----------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| `nav_title` | 탐색에서 페이지의 제목을 재정의합니다. 페이지 제목이 너무 길어 맞지 않을 때 유용합니다. 제공하지 않으면 `title` 필드가 사용됩니다. |
| `source`    | 콘텐츠를 공유 페이지로 가져옵니다. [공유 페이지](#shared-pages)를 참조하세요.                                                      |
| `related`   | 문서 하단에 관련 페이지 목록이 있습니다. 이 페이지들은 자동으로 카드로 전환됩니다. [관련 링크](#related-links)를 참조하세요.       |

```yaml filename="optional-fields.mdx"
---
nav_title: Nav 항목 제목
source: app/building-your-application/optimizing/images
related:
  description: 이미지 컴포넌트 API 참조를 참조하세요.
  links:
    - app/api-reference/components/image
---
```

## `App` 및 `Pages` 문서

**앱 라우터**와 **페이지 라우터**의 대부분의 기능은 완전히 다르기 때문에 각각에 대한 문서는 별도의 섹션(`02-app` 및 `03-pages`)에 보관되어 있습니다. 하지만 두 기능 간에 공유되는 몇 가지 기능이 있습니다.

### 공유 페이지

공유 페이지
콘텐츠 중복을 방지하고 콘텐츠가 동기화되지 않을 위험을 방지하기 위해 `source` 필드를 사용하여 한 페이지의 콘텐츠를 다른 페이지로 가져옵니다. 예를 들어 `<Link>` 컴포넌트는 앱과 페이지에서 거의 동일하게 작동합니다. 콘텐츠를 복제하는 대신 `app/.../link.mdx`에서 `pages/.../link.mdx`로 콘텐츠를 가져올 수 있습니다:

```mdx filename="app/.../link.mdx"
---
title: <Link>
description: <Link> 컴포넌트에 대한 API 참조입니다.
---

이 API 레퍼런스는 링크 컴포넌트에서 사용할 수 있는 소품 사용 방법과
및 링크 컴포넌트에 사용할 수 있는 구성 옵션을 사용하는 방법을 이해하는 데 도움이 됩니다.
```

```mdx filename="pages/.../link.mdx"
---
title: <Link>
description: <Link> 컴포넌트에 대한 API 참조입니다.
source: app/api-reference/components/link
---

{/* DO NOT EDIT THIS PAGE. */}
{/* The content of this page is pulled from the source above. */}
```

따라서 한 곳에서 콘텐츠를 편집하여 두 섹션에 모두 반영할 수 있습니다.

### 공유 콘텐츠

공유 페이지에는 때때로 **앱 라우터** 또는 **페이지 라우터** 전용 콘텐츠가 있을 수 있습니다. 예를 들어, `<Link>` 컴포넌트에는 **Pages**에서만 사용할 수 있고 **App**에서는 사용할 수 없는 `shallow` prop이 있습니다.

콘텐츠가 올바른 라우터에만 표시되도록 하려면 콘텐츠 블록을 <앱 전용> 또는 <페이지 전용> 컴포넌트로 래핑하면 됩니다:

```mdx filename="app/.../link.mdx"
이 콘텐츠는 App과 Pages 간에 공유됩니다.

<PagesOnly>

이 콘텐츠는 Pages 문서에만 표시됩니다.

</PagesOnly>

이 콘텐츠는 App과 Pages 간에 공유됩니다.
```

예제 및 코드 블록에 이러한 구성 요소를 사용할 가능성이 높습니다.

## 코드 블럭

코드 블록에는 복사하여 붙여넣을 수 있는 최소한의 작업 예제가 포함되어야 합니다. 즉, 추가 구성 없이 코드가 실행될 수 있어야 합니다.

예를 들어 `<Link>` 컴포넌트 사용법을 설명하는 경우 `import` 문과 `<Link>` 컴포넌트 자체를 포함해야 합니다.

```tsx filename="app/page.tsx"
import Link from 'next/link'

export default function Page() {
  return <Link href="/about">About</Link>
}
```

예제를 커밋하기 전에 항상 로컬에서 실행하세요. 이렇게 하면 코드가 최신 상태이고 작동하는지 확인할 수 있습니다.

### 언어 및 파일 이름

코드 블록에는 언어와 `filename`을 포함하는 헤더가 있어야 합니다. `filename` 프로퍼티를 추가하여 사용자에게 명령을 입력할 위치를 알려주는 특수 터미널 아이콘을 렌더링합니다. 예:

````mdx filename="code-example.mdx"
```bash filename="Terminal"
npx create-next-app
```
````

문서에 있는 대부분의 예제는 `tsx`와 `jsx`로 작성되었으며, 일부는 `bash`로 작성되었습니다. 하지만 지원되는 모든 언어를 사용할 수 있으며, [전체 목록](https://github.com/shikijs/shiki/blob/main/docs/languages.md#all-languages)은 다음과 같습니다.

JavaScript 코드 블록을 작성할 때 다음과 같은 언어 및 확장자 조합을 사용합니다.

|                               | 언어 | 확장자 |
| ----------------------------- | ---- | ------ |
| JavaScript 파일 with JSX code | jsx  | .js    |
| JavaScript 파일 without JSX   | js   | .js    |
| TypeScript 파일 with JSX      | tsx  | .tsx   |
| TypeScript 파일 without JSX   | ts   | .ts    |

### TS 및 JS Switcher

언어 전환기를 추가하여 타입스크립트와 자바스크립트 사이를 전환할 수 있습니다. 코드 블록은 사용자를 위해 JavaScript 버전과 함께 TypeScript로 먼저 작성해야 합니다.

현재는 TS와 JS 예제를 차례로 작성하고 `switcher` prop으로 연결합니다:

````mdx filename="code-example.mdx"
```tsx filename="app/page.tsx" switcher

```

```jsx filename="app/page.js" switcher

```
````

> **알아두면 좋은 점**: 향후에는 타입스크립트 스니펫을 자바스크립트로 자동 컴파일할 계획입니다. 그전까지는 [transform.tools](https://transform.tools/typescript-to-javascript)를 사용할 수 있습니다.

### 라인 강조 표시

코드 줄을 강조 표시할 수 있습니다. 코드의 특정 부분에 주의를 환기시키고 싶을 때 유용합니다. `highlight` prop에 숫자를 전달하여 줄을 강조 표시할 수 있습니다.

**한줄:** `highlight={1}`

```tsx filename="app/page.tsx" {1}
import Link from 'next/link'

export default function Page() {
  return <Link href="/about">About</Link>
}
```

**여러줄:** `highlight={1,3}`

```tsx filename="app/page.tsx" highlight={1,3}
import Link from 'next/link'

export default function Page() {
  return <Link href="/about">About</Link>
}
```

**범위:** `highlight={1-5}`

```tsx filename="app/page.tsx" highlight={1-5}
import Link from 'next/link'

export default function Page() {
  return <Link href="/about">About</Link>
}
```

## 아이콘

문서에서 사용할 수 있는 아이콘은 다음과 같습니다:

```mdx filename="mdx-icon.mdx"
<Check size={18} />
<Cross size={18} />
```

저희는 문서에 이모티콘을 사용하지 않습니다.

## 참고

중요하지만 중요하지 않은 정보는 메모를 사용하세요. 메모는 사용자의 주의를 분산시키지 않으면서 정보를 추가할 수 있는 좋은 방법입니다.

```mdx filename="notes.mdx"
> **알아두면 좋은 정보**: 한 줄 메모입니다.

> **알아두면 좋은 정보**:
>
> - 여러 줄로 된 노트에도 이 형식을 사용합니다.
> - 알아두거나 명심해야 할 항목이 여러 개 있을 때가 있습니다.
```

**Output:**

> **알아두면 좋은 정보**: 한 줄 메모입니다.
> **알아두면 좋은 정보**:
>
> - 여러 줄로 된 노트에도 이 형식을 사용합니다.
> - 알아두거나 명심해야 할 항목이 여러 개 있을 때가 있습니다.

## 관련 링크

관련 링크는 논리적인 다음 단계로 연결되는 링크를 추가하여 사용자의 학습 여정을 안내합니다.

- 링크는 페이지의 기본 콘텐츠 아래에 카드에 표시됩니다.
- 링크는 하위 페이지가 있는 페이지에 대해 자동으로 생성됩니다. 예를 들어 [최적화](/docs/app/building-your-application/optimizing) 섹션에는 모든 하위 페이지에 대한 링크가 있습니다. 페이지 메타데이터의 `related` 필드를 사용하여 관련 링크를 만듭니다.

페이지 메타데이터의 `related` 필드를 사용하여 관련 링크를 만듭니다.

```yaml filename="example.mdx"
---
related:
  description: 첫 번째 애플리케이션을 빠르게 시작하는 방법을 알아보세요.
  links:
    - app/building-your-application/routing/defining-routes
    - app/building-your-application/data-fetching
    - app/api-reference/file-conventions/page
---
```

### 중첩 항목

| 항목          | 필수? | 설명                                                                                                                                              |
| ------------- | ----- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| `title`       | 선택  | 카드 목록의 제목입니다. 기본값은 **다음 단계**입니다.                                                                                             |
| `description` | 선택  | 카드 목록에 대한 설명입니다.                                                                                                                      |
| `links`       | 필수  | 다른 문서 페이지에 대한 링크 목록입니다. 각 목록 항목은 상대 URL 경로(선행 슬래시 제외)여야 합니다. 예: `app/api-reference/file-conventions/page` |

## 다이어그램

다이어그램은 복잡한 개념을 설명하는 좋은 방법입니다. 저희는 Vercel의 디자인 가이드에 따라 [Figma](https://www.figma.com/) 사용하여 다이어그램을 만듭니다.

현재 이 다이어그램은 비공개 Next.js 사이트의 `/public` 폴더에 있습니다. 다이어그램을 업데이트하거나 추가하고 싶으시면 아이디어와 함께 [GitHub 이슈](https://github.com/vercel/next.js/issues/new?assignees=&labels=template%3A+documentation&projects=&template=4.docs_request.yml&title=Docs%3A+)를 열어주세요.

## 사용자 정의 컴포넌트 및 HTML

다음은 문서에 사용할 수 있는 React 컴포넌트입니다: `<Image />` (next/image), `<PagesOnly />`, `<AppOnly />`, `<Cross />`, `<Check />`.입니다. 문서에 `<details>` 태그 외에 원시 HTML은 허용되지 않습니다.

새로운 컴포넌트에 대한 아이디어가 있으시면 [GitHub 이슈](https://github.com/vercel/next.js/issues/new/choose)를 개설해 주세요.

## 스타일 가이드

이 섹션에는 기술 문서 작성을 처음 접하는 사용자를 위한 문서 작성 가이드라인이 포함되어 있습니다.

### 페이지 템플릿

이 섹션에는 기술 문서 작성을 처음 접하는 사용자를 위한 문서 작성 가이드라인이 포함되어 있습니다:

- **개요**: 페이지의 첫 단락은 사용자에게 해당 기능이 무엇이며 어떤 용도로 사용되는지 알려주어야 합니다. 그 다음에는 최소한의 작동 예제 또는 해당 API 참조가 나와야 합니다.
- **규칙**: 기능에 규칙이 있는 경우 여기에 설명해야 합니다.
- **예제**: 다양한 사용 사례에서 해당 기능을 어떻게 사용할 수 있는지 보여줍니다.
- **API 테이블**: API 페이지에는 섹션으로 바로 가기 링크(가능한 경우)가 있는 개요 테이블이 페이지 맨 위에 있어야 합니다.
- **다음 단계(관련 링크)**: 사용자의 학습 여정을 안내하기 위해 관련 페이지로 연결되는 링크를 추가합니다.

필요에 따라 이 섹션을 자유롭게 추가하세요.

### 페이지 유형

문서 페이지도 두 가지 카테고리로 나뉩니다: 개념과 참조입니다.

**개념 페이지**는 개념이나 기능을 설명하는 데 사용됩니다. 일반적으로 참조 페이지보다 더 길고 더 많은 정보를 포함합니다. Next.js 문서에서 개념 페이지는 **애플리케이션 구축** 섹션에 있습니다.
**참조 페이지**는 특정 API를 설명하는 데 사용됩니다. 일반적으로 더 짧고 집중적인 내용을 담고 있습니다. Next.js 문서에서 참조 페이지는 **API 참조** 섹션에 있습니다.

> **알아두면 좋은 정보**: 기여하는 페이지에 따라 다른 목소리와 스타일을 따라야 할 수도 있습니다. 예를 들어, 개념 페이지는 보다 교육적인 성격이 강하며 사용자를 지칭할 때 귀하라는 단어를 사용합니다. 참조 페이지는 좀 더 기술적인 페이지로, '만들기, 업데이트, 수락'과 같은 명령형 단어를 사용하며 귀하라는 단어를 생략하는 경향이 있습니다.

### 억양

다음은 문서 전체에서 일관된 스타일과 억양을 유지하기 위한 몇 가지 지침입니다:

- 명확하고 간결한 문장을 작성하세요. 접점을 피하세요.
  - 쉼표를 많이 사용하는 경우 문장을 여러 문장으로 나누거나 목록을 사용하는 것이 좋습니다.
  - 복잡한 단어를 더 간단한 단어로 바꾸세요. 예를 들어 _활용하다_ 대신 *사용하다*를 사용하세요.
- *이것*에 주의하세요. 모호하고 혼란스러울 수 있으므로 불분명한 경우 문장의 주어를 반복하는 것을 두려워하지 마세요.
  - 예를 들어, *Next.js는 이것*을 사용하는 대신 *React를 사용*합니다.
- 수동태 대신 능동태를 사용하세요. 능동태 문장이 더 읽기 쉽습니다.
  - 예를 들어 Next.js는 _React가_ 아닌 _React를_ 사용합니다
- _쉬운_, _빠른_, _간단한_, _그냥_ 등과 같은 단어를 사용하지 마세요. 이는 주관적인 표현이며 사용자에게 실망감을 줄 수 있습니다.
- _하지 않음_, _할 수 없음_, _불가능_ 등과 같은 부정적인 단어는 피하세요. 이는 독자에게 실망감을 줄 수 있습니다.
  - 예를 들어 _"페이지 간을 연결하는데 `<a>` 태그를 사용하지 마세요"_ 대신 *"`Link` 컴포넌트를 사용하여 페이지 간 링크를 만들 수 있습니다."*로 변경할 수 있습니다.
- 2인칭(당신)으로 작성합니다. 이렇게 하면 더 개인적이고 매력적입니다.
- 성 중립적인 언어를 사용합니다. 청중을 지칭할 때는 _개발자_, _사용자_ 또는 *독자*를 사용합니다.
- 코드 예제를 추가하는 경우 형식이 올바르게 지정되어 있고 작동하는지 확인하세요.

이 가이드라인이 모든 것을 담고 있지는 않지만 시작하는 데 도움이 될 것입니다. 기술 문서 작성에 대해 더 자세히 알아보고 싶다면 [Google 기술문서 작성 과정](https://developers.google.com/tech-writing/overview)을 확인하세요.

---

문서에 기여하고 Next.js 커뮤니티의 일원이 되어 주셔서 감사합니다!

<!-- To do: Latest Contributors Component -->
