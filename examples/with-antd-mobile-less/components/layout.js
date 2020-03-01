import React from 'react'
import { TabBar, Icon, WingBlank } from 'antd-mobile'
import styles from './layout.less'
import router from 'next/router'

const Layout = ({ children, active }) => {
  const goIndex = () => {
    router.push('/')
  }

  const goUser = () => {
    router.push('/user')
  }

  return (
    <>
      {/* use style vars */}
      <div className={styles.tab}>
        <TabBar
          unselectedTintColor="#888"
          tintColor="#366DF4"
          barTintColor="white"
        >
          <TabBar.Item
            title="Index"
            key="Index"
            icon={<Icon type="check-circle" />}
            selectedIcon={<Icon type="check-circle" color="blue" />}
            selected={active === 'Index'}
            onPress={goIndex}
          ></TabBar.Item>
          <TabBar.Item
            title="User"
            key="User"
            icon={<Icon type="cross-circle" />}
            selectedIcon={<Icon type="cross-circle" color="blue" />}
            selected={active === 'User'}
            onPress={goUser}
          ></TabBar.Item>
        </TabBar>
      </div>

      {/* use global className */}
      <WingBlank>
        <div className="center">{children}</div>
      </WingBlank>
    </>
  )
}

export default Layout
