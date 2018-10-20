const JSAsset = require('parcel/src/assets/JSAsset');
const envVisitor = require('parcel/src/visitors/env');
const ENV_RE = /\b(?:process\.env)\b/;

const babel7 = require('parcel/src/transforms/babel/babel7');
const getBabelConfig = require('parcel/src/transforms/babel/config');

async function babelTransform(asset) {
  // let config = await getBabelConfig(asset);
  // console.log(config[7])
  // if (config[6]) {
  //   await babel6(asset, config[6]);
  // }

  // if (config[7]) {
  await babel7(asset, {
    babelVersion: 7,
    config: {
      presets: ['next/babel']
    }
  });
  // }

  return asset.ast;
}


class NextJSAsset extends JSAsset {
  async pretransform() {
    if (this.options.sourceMaps) {
      await this.loadSourceMap();
    }

    await babelTransform(this);

    // Inline environment variables
    if (this.options.target === 'browser' && ENV_RE.test(this.contents)) {
      await this.parseIfNeeded();
      this.traverseFast(envVisitor);
    }
  }
}

module.exports = NextJSAsset