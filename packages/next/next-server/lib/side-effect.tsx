import React, { Component } from 'react'

const isServer = typeof window === 'undefined'

type State = JSX.Element[] | undefined

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

  emitChange = (): void => {
    if (this._hasHeadManager) {
      this.props.headManager.updateHead(
        this.props.reduceComponentsToState(
          [...this.props.headManager.mountedInstances],
          this.props
        )
      )
    }
  }

  constructor(props: any) {
    super(props)
    this._hasHeadManager =
      this.props.headManager && this.props.headManager.mountedInstances

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
