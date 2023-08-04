import skeetCloudConfig from '@root/skeet-cloud.config.json'

const siteConfig = {
  domain: skeetCloudConfig.app.appDomain,
  copyright: 'ELSOUL LABO B.V.',
  sitenameJA: 'Skeet Next.js GraphQL',
  sitenameEN: 'Skeet Next.js GraphQL',
  keywordsJA:
    'Next.js, Firebase, SSG, テンプレート, SEO, 多言語対応, サーバーレス, TypeScript, PWA, GraphQL',
  keywordsEN:
    'Next.js, Firebase, SSG, Template, SEO, i18n translation, Serverless, TypeScript, PWA, GraphQL',
  descriptionJA:
    'Next.jsのボイラープレート。SEO対応、多言語対応、SSG、PWA。WebAppをすぐに構築開始でき、そのデプロイは保証されています。',
  descriptionEN:
    'Next.js Boilerplate. SEO compatible, i18n translation, SSG, PWA. You can start building your WebApp today, and its deployment is guaranteed.',
  twitterAccount: '@SkeetDev',
  instagramAccount: 'elsoul_labo',
  githubAccount: 'elsoul',
  discordInvitationLink: 'https://discord.gg/H2HeqRq54J',
}

export default siteConfig
