const schema = {
  title: 'Fixture Loader options',
  type: 'object',
  properties: {
    value: { type: 'string' },
    count: { type: 'integer', minimum: 1 },
  },
  required: ['value'],
  additionalProperties: false,
}

module.exports = async function () {
  const { getOptions } = this
  const entry = (this._module.loaders || this.loaders)[this.loaderIndex]
  const original = entry.options
  const object = getOptions(schema)
  const sameObject = object === original && this.getOptions(schema) === original
  await Promise.resolve()
  const asyncSameObject = getOptions(schema) === original

  // Exercise raw option representations on the active entry. Webpack keeps the
  // unparsed options on NormalModule rather than loader-runner's normalized copy.
  function read(options, validationSchema) {
    entry.options = options
    try {
      return { value: getOptions(validationSchema) }
    } catch (error) {
      return { error: { name: error.name, message: error.message } }
    } finally {
      entry.options = original
    }
  }

  function formatting(value) {
    return Object.getOwnPropertySymbols(value).map((symbol) => ({
      key: Symbol.keyFor(symbol),
      ...Object.getOwnPropertyDescriptor(value, symbol),
    }))
  }

  const jsonFormatting = Object.fromEntries(
    Object.entries({
      compact: '{"value":"compact"}',
      empty: '{}',
      spacedEmpty: '{ }',
      spaces: '{\n  "value": "spaces"\n}',
      tabs: '{\r\n\t"value": "tabs"\r\n}',
      blankLines: '{\n\n    "value": "blank lines"\n}',
    }).map(([name, source]) => [name, formatting(read(source).value)])
  )
  const nestedJson = read('{\n  "nested": {"value": true}\n}').value

  const query = read(
    'value=query+value&tag=one&tag=two&flag&encoded=%23%3F&unicode=%E2%9C%93&__proto__=safe'
  )
  entry.options = ''
  const emptyQueryHasNullPrototype =
    Object.getPrototypeOf(getOptions()) === null
  entry.options = original
  const many = read(
    Array.from({ length: 1005 }, (_, i) => `key${i}=${i}`).join('&')
  ).value

  const report = {
    object,
    sameObject,
    asyncSameObject,
    missing: read(undefined),
    null: read(null),
    emptyString: read(''),
    emptyQueryHasNullPrototype,
    json: read('{"value":"json","count":3}', schema),
    jsonFormatting,
    nestedFormatting: formatting(nestedJson.nested),
    objectFormatting: formatting(object),
    queryFormatting: formatting(query.value),
    query,
    manyKeys: { count: Object.keys(many).length, last: many.key1004 },
    malformedJson: read('{"value":}'),
    missingRequired: read({}, schema),
    wrongType: read({ value: 'object', count: '2' }, schema),
    minimum: read({ value: 'object', count: 0 }, schema),
    additionalProperty: read({ value: 'object', extra: true }, schema),
    genericTitle: read({}, { ...schema, title: 'Fixture' }),
    customDataPath: read({}, { ...schema, title: 'Fixture configuration' }),
    referencedSchema: read(
      { value: 'reference', count: 4 },
      {
        definitions: { options: schema },
        $ref: '#/definitions/options',
      }
    ),
    scalar: read(false),
    array: read([1, 2]),
    noSchema: read({ count: 'not validated' }),
    applicationValidator: require('schema-utils').source,
  }
  return `export default JSON.parse(${JSON.stringify(JSON.stringify(report))})`
}
