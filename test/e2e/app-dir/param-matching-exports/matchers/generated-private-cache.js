async function privateConfig() {
  'use cache: private'
  return { lang: 'blocking' }
}

export async function experimental_generateParamMatching() {
  return privateConfig()
}
