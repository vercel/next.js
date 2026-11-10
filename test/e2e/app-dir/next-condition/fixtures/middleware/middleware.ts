import CJSExportsDefault from 'my-cjs-package/exports'
import ExternalCJSExportsDefault from 'my-external-cjs-package/exports'
import ESMExportsDefault from 'my-esm-package/exports'
import ExternalESMExportsDefault from 'my-external-esm-package/exports'

export default async function proxy(req: Request) {
  if (!req.url.includes('/_next/')) {
    console.log('==== MIDDLEWARE START ====')
    console.log('CJSExportsDefault:', CJSExportsDefault)
    console.log('ExternalCJSExportsDefault:', ExternalCJSExportsDefault)
    console.log('ESMExportsDefault:', ESMExportsDefault)
    console.log('ExternalESMExportsDefault:', ExternalESMExportsDefault)
    console.log('==== MIDDLEWARE END ====')
  }
}
