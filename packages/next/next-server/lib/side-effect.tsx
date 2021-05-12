import React, { Component } from 'react'

const isServer = typeof window === 'undefined'

type State = {
  components: JSX.Element[] | undefined
  safetyViolations: string[]
}

type SideEffectProps = {
  reduceComponentsToState: <T>(
    components: Array<React.ReactElement<any>>,
    props: T
  ) => State
  handleStateChange?: (state: State) => void
  headManager: any
  inAmpMode?: boolean
}

export default class extends Component<SideEffectProps> {
  private _hasHeadManager: boolean
  private _hasWarned: boolean

  emitChange = (): void => {
    if (this._hasHeadManager) {
      const state = this.props.reduceComponentsToState(
        [...this.props.headManager.mountedInstances],
        this.props
      )
      if (
        process.env.NODE_ENV !== 'production' &&
        !this._hasWarned &&
        state.safetyViolations.length > 0
      ) {
        this._hasWarned = true
        const s = state.safetyViolations.length === 1 ? '' : 's'
        console.warn(
          `You are using next/head in the following unsafe way${s} that may prevent you from using future React and Next.js features:\n` +
            state.safetyViolations.map((v) => `- ${v}`).join('\n') +
            '\nLearn more here: https://nextjs.org/docs/messages/next-head-unsafe'
        )
      }
      this.props.headManager.updateHead(state.components)
    }
  }

  constructor(props: any) {
    super(props)
    this._hasHeadManager =
      this.props.headManager && this.props.headManager.mountedInstances
    this._hasWarned = false

    if (isServer && this._hasHeadManager) {
      this.props.headManager.mountedInstances.add(this)
      this.emitChange()
    }
  }
  componentDidMount() {
    if (this._hasHeadManager) {
      this.props.headManager.mountedInstances.add(this)
    }
    this.emitChange()
  }
  componentDidUpdate() {
    this.emitChange()
  }
  componentWillUnmount() {
    if (this._hasHeadManager) {
      this.props.headManager.mountedInstances.delete(this)
    }
    this.emitChange()
  }

  render() {
    return null
  }
}
