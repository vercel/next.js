export class EventQueue<Dispatch> {
  private dispatch: Dispatch | null = null
  private readonly queue: Array<(dispatch: Dispatch) => void> = []

  enqueue(event: (dispatch: Dispatch) => void): void {
    if (this.dispatch) {
      event(this.dispatch)
    } else {
      this.queue.push(event)
    }
  }

  connect(dispatch: Dispatch): void {
    try {
      // Keep new events queued until the backlog is drained so they cannot overtake it.
      for (let i = 0; i < this.queue.length; i++) {
        this.queue[i](dispatch)
      }
    } finally {
      this.queue.length = 0
      this.dispatch = dispatch
    }
  }

  disconnect(dispatch: Dispatch): void {
    if (this.dispatch === dispatch) {
      this.dispatch = null
    }
  }
}
