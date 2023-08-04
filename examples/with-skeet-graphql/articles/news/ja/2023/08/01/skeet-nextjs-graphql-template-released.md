---
id: skeet-nextjs-graphql-template-released
title: オープンソースのサーバーレスフレームワーク Skeet が GraphQL 及び SQL(リレーショナルデータベース) に対応しました
category: プレスリリース
thumbnail: /news/2023/08/01/skeet-graphql.png
---

ELSOUL LABO B.V. (エルソウルラボ, 本社: オランダ・アムステルダム) は 2023 年 8 月 1 日、アプリ開発を高速かつ低コストにするオープンソースのサーバーレスフレームワーク Skeet v1 のメジャーリリースを発表しました。本リリースによって、Skeet において GraphQL 及び SQL(リレーショナルデータベース) を利用しての開発が可能になりました。

## 新しい Next.js (React) + GraphQL API サーバー オプションの追加

![Skeet Next.js (React) + GraphQL Option](/news/2023/08/01/skeet-create-got-graphql.png)

Skeet は GCP (Google Cloud) と Firebase 上にゼロメンテナンスアプリを構築できるオープンソースのサーバーレスフレームワークです。

API から Web・iOS・Android アプリまでを TypeScript で超速開発することができます。

今回のアップデートにより、GraphQL や SQL(リレーショナルデータベース) を活用したアプリケーションの開発にも対応しました。

![Skeet Next.js (React) + GraphQL Starter](/news/2023/08/01/skeet-next-graphql.png)

SQL(リレーショナルデータベース)への対応を通じて、SQL と NoSQL (Firestore) のハイブリッドな開発が可能になりました。
これにより、開発者は両方のデータベースタイプのメリットを取り入れることが可能となります。

リレーショナルデータベースは、関係性を持ったデータを扱うのに優れており、データ検索やトランザクション処理などでの整合性を保つことが容易です。一方で、NoSQL（Firestore など）は、柔軟性が高くスケーラビリティに優れているため、大量のデータや急速なデータ増加に対応するのに適しています。

Skeet のハイブリッド開発環境により、データの関係性が重要なビジネスロジックはリレーショナルデータベースで、ユーザーデータやログなどの大量データは NoSQL でそれぞれ最適に管理することが可能となります。これは、一つのアプリケーション内で最高のパフォーマンスを引き出すための重要な戦略となり得ます。

## データベースと API の可視化: Prisma と Apollo の活用

このアップデートでは、Prisma と Apollo というツールを活用して、データベースや API を UI で可視化できるようになりました。これにより、開発者はコードを書くだけでなく、直感的にデータ構造を理解し、操作することができます。

![Skeet Prisma Studio](/news/2023/08/01/prisma-studio.jpg)

Prisma (https://www.prisma.io/) は、SQL(リレーショナルデータベース)を TypeScript や JavaScript で簡単に扱うことができる ORM です。Skeet では Prisma を用いてデータベースのスキーマをシンプルかつ柔軟に定義でき、マイグレーションは自動生成され、開発に役立つ TypeScript の型も提供されます。また、Prisma Studio はデータベースを GUI で操作することを可能にし、開発者がデータの操作や確認を容易に行うことができます。

![Skeet Apollo Console](/news/2023/08/01/apollo-console.png)

Apollo (https://www.apollographql.com/) は GraphQL API サーバーを開発するための強力なツールです。Apollo の開発者コンソールでは、GraphQL のスキーマを可視化し、リアルタイムで API のテストを行うことができます。

新しい UI では、使いたい GraphQL Query や Mutation、データの内容をクリックするだけで、実際にフロントエンドで利用する GraphQL を生成できます。

これらのツールの活用により、Skeet は開発者がより直感的かつ効率的にアプリケーションを開発するためのプラットフォームを提供します。このアップデートにより、開発者はさらなる生産性の向上を実現できます。

Skeet は世界中すべてのアプリケーション開発現場の開発・メンテナンスコストを削減、開発者体験を向上させるためにオープンソースとして開発されています。

Skeet を用いた最先端のアプリ開発をぜひ体験してみてください。

Skeet ドキュメント: https://skeet.dev/ja/

Skeet (GitHub): https://github.com/elsoul/skeet-cli
