/** @type {import('next').NextAdapter } */
const myAdapter = {
  name: 'my-custom-adapter',
  modifyConfig: (config) => {
    console.log('called modify config in adapter')
    config.basePath = '/docs'
    return config
  },
}

export default myAdapter
