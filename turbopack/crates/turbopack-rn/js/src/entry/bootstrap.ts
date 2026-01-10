import '@react-native/js-polyfills/console'
import '@react-native/js-polyfills/error-guard'
import 'react-native/Libraries/Core/InitializeCore.js'
import 'react-native-url-polyfill/auto'
// @ts-ignore
import { DevSettings } from 'react-native'

try {
  // @ts-ignore
  require('expo/virtual/streams.js')
} catch (e) {}

// @ts-ignore
globalThis.location = { reload: () => DevSettings.reload() }

import { initializeHMR } from './client'

initializeHMR({
  assetPrefix: '',
})
