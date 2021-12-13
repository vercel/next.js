function nextBootstrapLoader(this: any) {
  return `
        import bootstrap from 'next/dist/client/bootstrap'
        bootstrap().then(() => import(/* webpackMode: "eager" */${JSON.stringify(
          this.resourcePath
        )}))
        `
}

export default nextBootstrapLoader
