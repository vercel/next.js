import { nextTestSetup } from 'e2e-utils'
import path from 'path'

function readRequiredFilesManifest(next: any) {
  return next.readFile('required-server-files.json')
}

describe('instrumentation - required-files-instrumentation-entry', () => {
  describe('node-app', () => {
    const { next } = nextTestSetup({
      files: path.join(__dirname, 'edge-app'),
    })

  })
  
  describe('edge-app', () => {
    const { next } = nextTestSetup({
      files: path.join(__dirname, 'edge-app'),
    })
  })

  


  
})
