import React from 'react'
import { Router } from '@/routes'

import Paper from 'material-ui/Paper'
import { BottomNavigation, BottomNavigationItem } from 'material-ui/BottomNavigation'

// icons
import Apps from 'material-ui/svg-icons/navigation/apps'
import Stars from 'material-ui/svg-icons/action/stars'

class BottomNav extends React.Component {
  constructor (props) {
    super(props)
    this.state = {
      selectedIndex: 0
    }
  }

  select = (index) => this.setState({ selectedIndex: index })

  render () {
    return (
      <Paper style={{ position: 'fixed', bottom: 0, zIndex: 1000, width: '100%' }} zDepth={1}>
        <BottomNavigation selectedIndex={this.state.selectedIndex}>
          <BottomNavigationItem
            label='Latest'
            icon={<Apps />}
            onTouchTap={() => {
              Router.pushRoute('index', { sortBy: 'latest' })
              this.select(0)
            }}
          />
          <BottomNavigationItem
            label='Top'
            icon={<Stars />}
            onTouchTap={() => {
              Router.pushRoute('index', { sortBy: 'top' })
              this.select(1)
            }}
          />
        </BottomNavigation>
      </Paper>
    )
  }
}

export default BottomNav
