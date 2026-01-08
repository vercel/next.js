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

module.exports = function (content) {
  let { reactNativeWorkletsInstalled } = this.getOptions() || {}

  let filename = this.resourcePath || ''

  let presets = []
  let plugins = []

  let isFlow = content.includes('@flow')
  if (isFlow) {
    presets.push(['@babel/preset-flow', { experimental_useHermesParser: true }])
    plugins.push('@babel/plugin-syntax-jsx')
  }
  let isTypescript = filename.endsWith('.ts') || filename.endsWith('.tsx')
  if (isTypescript) {
    plugins.push([
      '@babel/plugin-syntax-typescript',
      { isTSX: filename.endsWith('.tsx') },
    ])
  }

  let runCodegenTransform = content.includes('codegenNativeComponent<')
  if (runCodegenTransform) {
    plugins.push('@react-native/babel-plugin-codegen')
  }
  if (reactNativeWorkletsInstalled) {
    let runWorkletTransform = WORKLET_REGEX.test(content)
    if (runWorkletTransform) {
      plugins.push('react-native-worklets/plugin')
    }
  }

  if (presets.length === 0 && plugins.length === 0) {
    return content
  }

  let babelConfig = {
    babelrc: false,
    configFile: false,
    presets,
    plugins,
  }

  this.getOptions = () => babelConfig
  return babelLoader.call(this, content)
}
