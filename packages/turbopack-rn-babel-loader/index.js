const babelLoader = require('babel-loader')

// https://github.com/software-mansion/react-native-reanimated/blob/ce9032c25e088e09bcce519963614cc5355beebb/packages/react-native-worklets/plugin/src/autoworkletization.ts#L16

const WORKLET_REGEX = new RegExp(
  [
    "'worklet'",
    '"worklet"',
    'useAnimatedScrollHandler',
    'react-native-gesture-handler',
    'useFrameCallback',
    'useAnimatedStyle',
    'useAnimatedProps',
    'createAnimatedPropAdapter',
    'useDerivedValue',
    'useAnimatedScrollHandler',
    'useAnimatedReaction',
    'withTiming',
    'withSpring',
    'withDecay',
    'withRepeat',
    'runOnUI',
    'executeOnUIRuntimeSync',
    'scheduleOnUI',
    'runOnUISync',
    'runOnUIAsync',
    'runOnRuntime',
    'scheduleOnRuntime',
  ].join('|')
)

const MACRO_REGEX = /[./]macro(\.c?js)?["']/

const DEBUG = process.env.TURBOPACK_DEBUG_RN_BABEL_LOADER

module.exports = function (content) {
  let { workletPluginName, babelPluginMacrosName } = this.getOptions() || {}

  let filename = this.resourcePath || ''

  let presets = []
  let plugins = []

  let isFlow = content.includes('@flow')
  if (isFlow) {
    presets.push(['@babel/preset-flow', { experimental_useHermesParser: true }])
    plugins.push('@babel/plugin-syntax-jsx')
  }

  if (MACRO_REGEX.test(content)) {
    plugins.push(babelPluginMacrosName)
  }

  let runCodegenTransform = content.includes('codegenNativeComponent<')
  if (runCodegenTransform) {
    plugins.push('@react-native/babel-plugin-codegen')
  }
  if (workletPluginName != null) {
    let runWorkletTransform = WORKLET_REGEX.test(content)
    if (runWorkletTransform) {
      plugins.push(workletPluginName)
    }
  }

  if (presets.length === 0 && plugins.length === 0) {
    return content
  }

  let isTypescript = filename.endsWith('.ts') || filename.endsWith('.tsx')
  if (isTypescript) {
    plugins.push([
      '@babel/plugin-syntax-typescript',
      { isTSX: filename.endsWith('.tsx') },
    ])
  }

  let babelConfig = {
    babelrc: false,
    configFile: false,
    presets,
    plugins,
  }

  this.getOptions = () => babelConfig

  if (DEBUG != null) {
    let async = this.async
    this.async = function () {
      let cb = async.call(this)
      return (err, result) => {
        if (filename.endsWith(DEBUG)) {
          console.log(result)
        }
        cb(err, result)
      }
    }
  }

  return babelLoader.call(this, content)
}
