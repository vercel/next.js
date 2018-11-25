import React, {Component} from 'react'
import {UserAgent} from '@quentin-sommer/react-useragent'

class Index extends Component {
  render () {
    return (
      <div>
        <p>
          The following texts render conditionally depending of your user-agent,
          try visiting with another device or using the chrome dev tools device
          emulator !
        </p>
        <UserAgent android>
          <div>
            <p>You seem to be on an android device</p>
          </div>
        </UserAgent>
        <UserAgent ios>
          <div>
            <p>You seem to be on an ios device</p>
          </div>
        </UserAgent>
        <UserAgent computer>
          <div>
            <p>You seem to be on a computer</p>
          </div>
        </UserAgent>
        <UserAgent linux>
          <p>Hello Linux!</p>
        </UserAgent>
        <UserAgent mac>
          <p>Hello MacOS!</p>
        </UserAgent>
        <UserAgent windows>
          <p>Hello Windows!</p>
        </UserAgent>
        <div>
          <a href='https://github.com/quentin-sommer/react-useragent'>
            See full documentation here
          </a>
        </div>
      </div>
    )
  }
}

export default Index
