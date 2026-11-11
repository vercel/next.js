export default {
  name: 'release-env',
  viteEnvironment: 'ssr',
  setup(global) {
    global.releaseRealm = 42
    return {
      teardown() {
        delete global.releaseRealm
      },
    }
  },
}
