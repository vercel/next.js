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
  let {
    cwd,
    babelPresetFlowName,
    babelPluginSyntaxJsxName,
    babelPluginCodegenName,
    babelPluginSyntaxTypescriptName,
    workletPluginName,
    babelPluginMacrosName,
  } = this.getOptions() || {}

  let filename = this.resourcePath || ''

  let presets = []
  let plugins = []

  if (content.includes('@flow')) {
    if (babelPresetFlowName == null) {
      throw new Error('Missing babelPresetFlowName')
    }
    if (babelPluginSyntaxJsxName == null) {
      throw new Error('Missing babelPluginSyntaxJsxName')
    }
    presets.push([babelPresetFlowName, { experimental_useHermesParser: true }])
    plugins.push(babelPluginSyntaxJsxName)
  }

  if (babelPluginMacrosName != null && MACRO_REGEX.test(content)) {
    plugins.push(babelPluginMacrosName)
  }

  if (content.includes('codegenNativeComponent<')) {
    if (babelPluginCodegenName == null) {
      throw new Error('Missing babelPluginCodegenName')
    }
    plugins.push(babelPluginCodegenName)
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

  if (filename.endsWith('.ts') || filename.endsWith('.tsx')) {
    if (babelPluginSyntaxTypescriptName == null) {
      throw new Error('Missing babelPluginSyntaxTypescriptName')
    }
    plugins.push([
      babelPluginSyntaxTypescriptName,
      { isTSX: filename.endsWith('.tsx') },
    ])
  }

  let babelConfig = {
    babelrc: false,
    configFile: false,
    cwd,
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
