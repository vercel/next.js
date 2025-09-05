const OriginalRspackReactRefreshPlugin = require("@rspack/plugin-react-refresh")

class RspackReactRefreshPlugin extends OriginalRspackReactRefreshPlugin {
    static entry = require.resolve('@rspack/plugin-react-refresh/react-refresh-entry')

    constructor(options) {
        super({
            ...options,
            overlay: {
                module: require.resolve('./refresh-overlay')
            }
        })
    }
}

module.exports = RspackReactRefreshPlugin
