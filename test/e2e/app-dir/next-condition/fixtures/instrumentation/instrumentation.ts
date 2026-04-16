import CJSExportsDefault from 'my-cjs-package/exports'
import ExternalCJSExportsDefault from 'my-external-cjs-package/exports'
import ESMExportsDefault from 'my-esm-package/exports'
import ExternalESMExportsDefault from 'my-external-esm-package/exports'

export function register() {
  console.log('==== REGISTER START ====')
  console.log('CJSExportsDefault:', CJSExportsDefault)
  console.log('ExternalCJSExportsDefault:', ExternalCJSExportsDefault)
  console.log('ESMExportsDefault:', ESMExportsDefault)
  console.log('ExternalESMExportsDefault:', ExternalESMExportsDefault)
  console.log('==== REGISTER END ====')
}
