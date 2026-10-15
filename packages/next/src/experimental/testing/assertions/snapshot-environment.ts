import { NodeSnapshotEnvironment } from '../../../compiled/next-test-primitives'

export class VitestSnapshotEnvironment extends NodeSnapshotEnvironment {
  getHeader() {
    return `// Vitest Snapshot v${this.getVersion()}, https://vitest.dev/guide/snapshot.html`
  }
}
