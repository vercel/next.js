async function privateConfig() {
  'use cache: private'
  return { lang: 'blocking' }
}

export async function unstable_generateParamMatching() {
  return privateConfig()
}
