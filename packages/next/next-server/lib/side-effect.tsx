import React, { Component } from 'react'

const isServer = typeof window === 'undefined'

type State = {
  components: JSX.Element[] | undefined
  shouldWarn: boolean
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
        state.shouldWarn
      ) {
        this._hasWarned = true
        console.warn(
          `You are using next/head in unsafe ways that may prevent you from using future React and Next.js features.` +
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
