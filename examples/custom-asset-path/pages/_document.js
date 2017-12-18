import Document from 'next/document'
import _getAssetPath from '../lib/get-asset-path'

export default class MyDocument extends Document {
  // providing custom _getAssetPath
  _getAssetPath (hash, asset, assetPrefix, assetMap) {
    const getAssetPath = this.props.dev ? super._getAssetPath : _getAssetPath
    return getAssetPath(hash, asset, assetPrefix, assetMap)
  }
}
