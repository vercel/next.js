import {
  webpack,
  onWebpackInit,
  isWebpack5,
} from 'next/dist/compiled/webpack/webpack'

let CssDependency
onWebpackInit(function () {
  CssDependency = class extends webpack.Dependency {
    constructor(
      { identifier, content, media, sourceMap },
      context,
      identifierIndex
    ) {
      super()

      this.identifier = identifier
      this.identifierIndex = identifierIndex
      this.content = content
      this.media = media
      this.sourceMap = sourceMap
      this.context = context
    }

    getResourceIdentifier() {
      return `css-module-${this.identifier}-${this.identifierIndex}`
    }
  }

  // @ts-ignore TODO: remove ts-ignore when webpack 5 is stable
  if (isWebpack5) {
    webpack.util.serialization.register(
      CssDependency,
      'next/dist/build/webpack/plugins/mini-css-extract-plugin/src/CssDependency',
      null,
      {
        serialize(obj, { write }) {
          write(obj.identifier)
          write(obj.content)
          write(obj.media)
          write(obj.sourceMap)
          write(obj.context)
          write(obj.identifierIndex)
        },
        deserialize({ read }) {
          const obj = new CssDependency(
            {
              identifier: read(),
              content: read(),
              media: read(),
              sourceMap: read(),
            },
            read(),
            read()
          )

          return obj
        },
      }
    )
  }
})

export { CssDependency as default }
