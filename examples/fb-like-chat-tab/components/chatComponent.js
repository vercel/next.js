import {Component} from 'react'
import ChatSideBar from '../components/chatSideBar'
import ChatPannel from '../components/chatPannel'
import Store from '../globalStore/store'
class ChatComponent extends Component {
  constructor (props) {
    super(props)
    this.updateState = this.updateState.bind(this)
    this.renderChatPanel = this.renderChatPanel.bind(this)
    this.state = {
      user: {}
    }
  }
  componentDidMount () {
    this.setState({
      user: Object.assign(this.state.user, Store.userData)
    })
  }
  // Updates global Store variable and state of Chatcomponent
  updateState (obj) {
    if (this.componentAlreadyRendered(obj.userName) === 0) {
      this.updateGlobalStore(obj)
      this.setState({
        user: Object.assign(this.state.user, Store.userData)
      })
    }
  }
  // Updates Global store with new clicked user data
  updateGlobalStore (obj) {
    Store.userData = Object.assign(Store.userData || {}, {[obj.key]: obj.userName})
  }
  // Checks if chat tab for this user is already open
  componentAlreadyRendered (userName) {
    return Object
              .values(this.state.user)
              .filter(user => user === userName)
              .length
  }
  // Renders ChatPannel when change in state is observed
  renderChatPanel (key) {
    return (
      <ChatPannel key={key} index={key} details={{ key: key, userName: this.state.user[key] }} />
    )
  }
  render () {
    return (
      <div className='sideBar'>
        <ChatSideBar func_updateState={this.updateState} />
        <div className='pannel'>
          {Object.keys(this.state.user).map(this.renderChatPanel)}
        </div>
        <style jsx>{`
          .sideBar {
            display: flex;
            flex-direction: row-reverse;
          }
          .pannel{
            display:flex;
          }
        `}</style>
      </div>
    )
  }
}

export default ChatComponent
