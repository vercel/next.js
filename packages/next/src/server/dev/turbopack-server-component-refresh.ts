import { resolve } from 'path'
import {
  HMR_MESSAGE_SENT_TO_BROWSER,
  type ServerComponentChangesMessage,
} from './hot-reloader-types'
import { getHmrRefreshTargets } from './hmr-refresh-targets'

export type TurbopackHmrRefreshOwners =
  | { type: 'unrelated' }
  | { type: 'all' }
  | { type: 'owners'; owners: string[] }

type BuildPhase = 'idle' | 'building' | 'built'
type OwnerScope = { type: 'all' } | { type: 'owners'; paths: Set<string> }

function mergeOwnerScopes(
  current: OwnerScope | null,
  incoming: OwnerScope
): OwnerScope {
  if (current?.type === 'all' || incoming.type === 'all') {
    return { type: 'all' }
  }
  return {
    type: 'owners',
    paths: new Set([...(current?.paths ?? []), ...incoming.paths]),
  }
}

export class TurbopackServerComponentRefresh {
  private phase: BuildPhase = 'idle'
  private buildOwnerScope: OwnerScope = { type: 'owners', paths: new Set() }
  private applyingOwnerScope: OwnerScope | null = null
  // Applied owners survive build boundaries until a refresh includes them.
  private appliedOwnerScope: OwnerScope | null = null
  private entryRefreshSent = false
  private completedRenderScope: ServerComponentChangesMessage['renderScope'] = {
    type: 'all',
  }
  private readonly pending = new Map<string, ServerComponentChangesMessage>()

  constructor(
    private readonly options: {
      appDir: string | undefined
      projectRoot: string
      pageExtensions: readonly string[]
      nextHash: () => string
      enqueue: (id: string, message: ServerComponentChangesMessage) => void
      flush: () => void
      scheduleFlush: () => void
      onRefreshEnqueued: () => void
    }
  ) {}

  startBuild(): void {
    this.phase = 'building'
    this.buildOwnerScope = { type: 'owners', paths: new Set() }
    this.entryRefreshSent = false
    this.completedRenderScope = { type: 'all' }
  }

  finishBuild(): void {
    this.phase = 'built'
    this.completedRenderScope = this.computeRenderScope(
      this.appliedOwnerScope === null
        ? this.buildOwnerScope
        : mergeOwnerScopes(this.buildOwnerScope, this.appliedOwnerScope)
    )

    for (const [id, message] of this.pending) {
      this.options.enqueue(id, this.addRenderScope(message))
    }
    if (this.pending.size > 0) {
      this.entryRefreshSent = true
      this.appliedOwnerScope = null
    } else if (this.appliedOwnerScope !== null) {
      this.enqueueAppliedRefresh()
    }
    this.pending.clear()
  }

  handleMessage(id: string, message: ServerComponentChangesMessage): void {
    if (this.phase !== 'built') {
      this.pending.set(id, message)
    } else if (!this.entryRefreshSent) {
      this.options.enqueue(id, this.addRenderScope(message))
      this.entryRefreshSent = true
      this.appliedOwnerScope = null
      this.options.scheduleFlush()
    }
  }

  handleUpdate(result: TurbopackHmrRefreshOwners | undefined): boolean {
    if (result?.type === 'unrelated') {
      this.applyingOwnerScope = null
      return false
    }
    const ownerScope: OwnerScope =
      result === undefined || result.type === 'all'
        ? { type: 'all' }
        : { type: 'owners', paths: new Set(result.owners) }
    this.applyingOwnerScope = ownerScope
    this.buildOwnerScope = mergeOwnerScopes(this.buildOwnerScope, ownerScope)
    return true
  }

  handleUpdateApplied(): boolean {
    if (this.applyingOwnerScope === null) {
      return false
    }
    this.appliedOwnerScope = mergeOwnerScopes(
      this.appliedOwnerScope,
      this.applyingOwnerScope
    )
    this.applyingOwnerScope = null
    return this.phase === 'built'
  }

  flushAppliedUpdate(): void {
    if (this.phase === 'built' && this.appliedOwnerScope !== null) {
      this.enqueueAppliedRefresh()
      this.options.flush()
    }
  }

  private computeRenderScope(
    ownerScope: OwnerScope
  ): ServerComponentChangesMessage['renderScope'] {
    if (ownerScope.type === 'all') {
      return { type: 'all' }
    }
    return getHmrRefreshTargets(
      new Set(
        [...ownerScope.paths].map((ownerPath) =>
          resolve(this.options.projectRoot, ownerPath)
        )
      ),
      this.options.appDir,
      this.options.pageExtensions
    )
  }

  private addRenderScope(
    message: ServerComponentChangesMessage
  ): ServerComponentChangesMessage {
    return { ...message, renderScope: this.completedRenderScope }
  }

  private enqueueAppliedRefresh(): void {
    const renderScope = this.computeRenderScope(this.appliedOwnerScope!)
    this.options.enqueue('server-hmr', {
      type: HMR_MESSAGE_SENT_TO_BROWSER.SERVER_COMPONENT_CHANGES,
      hash: this.options.nextHash(),
      refreshScope: { type: 'all' },
      renderScope,
    })
    this.appliedOwnerScope = null
    this.entryRefreshSent = true
    this.options.onRefreshEnqueued()
  }
}
