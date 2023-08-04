---
id: readme
title: Readme
description: Skeet Next.js (React) Template README
---

![Skeet Next.js Template](https://storage.googleapis.com/skeet-assets/imgs/samples/WebAppBoilerplate.png)

## Skeet App Next.js Template

Next.js (React) App Environment for Skeet Framework

[GitHub - Skeet App Next.js Template](https://github.com/elsoul/skeet-next)

## Aiming to

- Fast Development
- High Performance
- Global Scale
- Maintainable Code
- Strong SEO

## Summary

- [x] [Next.js - SSG Framework](https://nextjs.org/)
- [x] [React - UI Framework](https://reactjs.org/)
- [x] [TypeScript - Type Check](https://www.typescriptlang.org/)
- [x] [ESLint - Linter](https://eslint.org/)
- [x] [Prettier - Formatter](https://prettier.io/)
- [x] [Recoil - State Management](https://recoiljs.org/)
- [x] [Next i18next - i18n Translation](https://github.com/isaachinman/next-i18next)
- [x] [Firebase](https://firebase.google.com/)
- [x] [Tailwind - CSS Framework](https://tailwindcss.com/)

## Usage

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

Open a new terminal and run:

```bash
$ skeet login
$ export ACCESS_TOKEN=<your-token>
```

**※ You need OpenAI API key to get success for default test.**

_./functions/openai/.env_

```bash
CHAT_GPT_KEY=your-key
CHAT_GPT_ORG=your-org
```

Test your app:

```bash
$ skeet test
```

Open Firebase Emulator: http://localhost:4000

Open Front-end App: http://localhost:4200
