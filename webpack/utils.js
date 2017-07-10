import Crypto from 'crypto'
import { relative, dirname } from 'path'

export function requireValue (dep, requestShortener) {
  let { module } = dep

  if (!module) {
    return null
  }

  if (!module.resource) {
    // Handle ConcatenatedModule
    module = module.rootModule
  }

  // Handle references to content stored in node_modules
  if (module.resource.includes('node_modules') || module.resource.includes('next.js/dist/')) {
    return JSON.stringify(requestShortener.shorten(dep.request).replace(/.*?node_modules\//, ''))
  }

  const fingerprint = loaderFingerprint(module)
  const reason = (module.reasons.find(({ dependency }) => dependency === dep) || {module: module.issuer}).module
  let request = relative(dirname(reason.resource || reason.rootModule.resource), module.resource)
  if (!/^\./.test(request)) {
    request = `./${request}`
  }

  return JSON.stringify(`${request}_${fingerprint}`)
};

export function nodeModuleName (module) {
  let { resource, rootModule } = module

  if (!resource && rootModule) {
    resource = rootModule.resource
  }

  /* istanbul ignore next : Sanity */
  if (!resource) {
    throw new Error('Only file backed loaders are supported')
  }

  const relativeName = relative(process.cwd(), resource)

  return `${relativeName}_${exports.loaderFingerprint(module)}`
};

export function loaderFingerprint (module) {
  const hash = Crypto.createHash('md5')

  const { loaders = [] } = module
  loaders.forEach(({ loader, ident = '' }) => {
    hash.update(loader)
    hash.update(ident)
  })

  return `${hash.digest('hex')}.js`
};
