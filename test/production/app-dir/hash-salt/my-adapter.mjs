// @ts-check
/** @type {import('next').NextAdapter } */
const myAdapter = {
  name: 'my-custom-adapter',
  modifyConfig: (config) => {
    if (process.env.ADAPTER_HASH_SALT != null) {
      config.outputHashSalt =
        (config.outputHashSalt ?? '') + process.env.ADAPTER_HASH_SALT
    }
    return config
  },
}

export default myAdapter
