const conditions = {
  has: [
    {
      type: 'header',
      key: 'x-contract-token',
      value: '(?<token>allowed|alternate)',
    },
    { type: 'cookie', key: 'session', value: 'active' },
    { type: 'query', key: 'required', value: 'yes' },
    { type: 'host', value: '(?:condition|blocked)\\.example' },
  ],
  missing: [
    { type: 'header', key: 'x-contract-blocked' },
    { type: 'cookie', key: 'blocked', value: 'true' },
    { type: 'query', key: 'disabled', value: 'true' },
    { type: 'host', value: 'blocked\\.example' },
  ],
}

const patterns = [
  { name: 'literal', source: 'literal' },
  { name: 'named', source: 'single/:capture', capture: ':capture' },
  { name: 'wildcard', source: 'many/:capture*' },
  { name: 'one-or-more', source: 'some/:capture+', capture: ':capture*' },
  { name: 'optional', source: 'optional/:capture?' },
  { name: 'regex', source: 'digits/:capture(\\d{1,})', capture: ':capture' },
  {
    name: 'escaped',
    source: 'english\\(default\\)/:capture',
    capture: ':capture',
  },
]

function patternRules(kind) {
  return patterns.map(({ name, source, capture }) => ({
    source: `/patterns/${kind}/${source}`,
    ...(kind === 'header'
      ? {
          headers: [
            { key: 'x-contract-pattern', value: name },
            ...(capture ? [{ key: 'x-contract-capture', value: capture }] : []),
          ],
        }
      : {
          destination: `/?pattern=${name}${capture ? `&capture=${capture}` : ''}`,
          ...(kind === 'redirect' ? { permanent: false } : {}),
        }),
  }))
}

module.exports = {
  async headers() {
    return [
      ...patternRules('header'),
      {
        source: '/conditions/header',
        ...conditions,
        headers: [{ key: 'x-contract-conjunction', value: ':token' }],
      },
    ]
  },
  async redirects() {
    return [
      ...patternRules('redirect'),
      {
        source: '/conditions/redirect',
        ...conditions,
        destination: '/?token=:token',
        permanent: false,
      },
    ]
  },
  async rewrites() {
    return [
      ...patternRules('rewrite'),
      {
        source: '/conditions/rewrite',
        ...conditions,
        destination: '/?token=:token',
      },
    ]
  },
}
