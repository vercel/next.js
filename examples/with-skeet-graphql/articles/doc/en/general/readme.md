---
id: readme
title: Readme
description: Skeet Next.js (React) テンプレート README
---

![Skeet Next.js Template](https://storage.googleapis.com/skeet-assets/imgs/samples/WebAppBoilerplate.png)

## Skeet App Next.js テンプレート

Next.js (React) 環境 for Skeet Framework

[GitHub - Skeet App Next.js Template](https://github.com/elsoul/skeet-next)

## 心がけ

- 迅速な開発
- ハイパフォーマンス
- グローバルスケール(多言語化含む)
- メンテナンスしやすいコードベース
- SEO に強い

## 技術選定

- [x] [Next.js - SSG Framework](https://nextjs.org/)
- [x] [React - UI Framework](https://reactjs.org/)
- [x] [TypeScript - Type Check](https://www.typescriptlang.org/)
- [x] [ESLint - Linter](https://eslint.org/)
- [x] [Prettier - Formatter](https://prettier.io/)
- [x] [Recoil - State Management](https://recoiljs.org/)
- [x] [Next i18next - i18n Translation](https://github.com/isaachinman/next-i18next)
- [x] [Firebase - Hosting & Analytics](https://firebase.google.com/)
- [x] [Tailwind - CSS Framework](https://tailwindcss.com/)

## クイックスタート

```bash
$ npm i -g firebase-tools
$ npm i -g @skeet-framework/cli
```

```bash
$ skeet create <project-name>
```

```bash
$ cd <project-name>
$ skeet s
```

開発中コンソールにて Auth を利用した確認も可能です:

```bash
$ skeet login
$ export ACCESS_TOKEN=<your-token>
```

**※ OpenAI API key が必要です**

_./functions/openai/.env_

```bash
CHAT_GPT_KEY=your-key
CHAT_GPT_ORG=your-org
```

テストコマンド:

```bash
$ skeet test
```

Firebase Emulator: http://localhost:4000

Front-end App: http://localhost:4200
