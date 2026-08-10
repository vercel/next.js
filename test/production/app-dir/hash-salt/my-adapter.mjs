// @ts-check
/** @type {import('next').NextAdapter } */
const myAdapter = {
  name: 'my-custom-adapter',
  modifyConfig: (config) => {
    if (process.env.ADAPTER_HASH_SALT != null) {
      config.outputHashSalt =
        (config.outputHashSalt ?? '') + process.env.ADAPTER_HASH_SALT
    }
    if (process.env.EXPERIMENTAL_OUTPUT_HASH_SALT_CONFIG != null) {
      config.experimental.outputHashSalt =
        (config.experimental.outputHashSalt ?? '') +
        process.env.EXPERIMENTAL_OUTPUT_HASH_SALT_CONFIG
    }
    return config
  },
}

export default myAdapter
