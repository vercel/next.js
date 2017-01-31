import Head from 'next/head'
import Link from 'next/link'

import Avatar from 'react-md/lib/Avatars'
import Button from 'react-md/lib/Buttons/Button'
import FontIcon from 'react-md/lib/FontIcons'
import ListItem from 'react-md/lib/Lists/ListItem'
import NavigationDrawer from 'react-md/lib/NavigationDrawers'
import SelectField from 'react-md/lib/SelectFields'

const avatarSrc = 'https://cloud.githubusercontent.com/assets/13041/19686250/971bf7f8-9ac0-11e6-975c-188defd82df1.png'

const drawerHeaderChildren = [
  <Avatar
    key={avatarSrc}
    src={avatarSrc}
    role='presentation'
    iconSized
    style={{ alignSelf: 'center', marginLeft: 16, marginRight: 16, flexShrink: 0 }}
  />,
  <SelectField
    id='account-switcher'
    defaultValue='Jonathan'
    menuItems={['Jonathan', 'Fred']}
    key='account-switcher'
    position={SelectField.Positions.BELOW}
    className='md-select-field--toolbar'
  />
]

const NavigationLink = (props) => {
  const { href, as, children, ..._props } = props
  return (
    <div {..._props}>
      <Link href={href} as={as}>
        <a className='md-list-tile' style={{padding: 0, overflow: 'hidden'}}>
          {children}
        </a>
      </Link>
    </div>
  )
}

export default () => {
  const closeButton = (
    <Button
      icon
      tooltipLabel='Close the interactive demo'
      tooltipDelay={150}
      tooltipPosition='left'
    >
      close
    </Button>
  )

  return (
    <div>
      <Head>
        <link rel='stylesheet' href='/static/react-md.light_blue-yellow.min.css' />
        <link rel='stylesheet' href='https://fonts.googleapis.com/css?family=Roboto:300,400,500' />
        <link rel='stylesheet' href='https://fonts.googleapis.com/css?family=Material+Icons' />
      </Head>
      <NavigationDrawer
        navItems={[
          <ListItem
            key='0'
            component={NavigationLink}
            href='/'
            leftIcon={<FontIcon>inbox</FontIcon>}
            tileClassName='md-list-tile--mini'
            primaryText={'Root'}
          />,
          <ListItem
            key='1'
            component={NavigationLink}
            href='/non-existing-page'
            leftIcon={<FontIcon>star</FontIcon>}
            tileClassName='md-list-tile--mini'
            primaryText={'404 page'}
          />
        ]}
        contentClassName='md-grid'
        drawerHeaderChildren={drawerHeaderChildren}
        mobileDrawerType={NavigationDrawer.DrawerTypes.TEMPORARY_MINI}
        tabletDrawerType={NavigationDrawer.DrawerTypes.PERSISTENT_MINI}
        desktopDrawerType={NavigationDrawer.DrawerTypes.PERSISTENT_MINI}
        toolbarTitle='Hello, World!'
        toolbarActions={closeButton}
      >
        <h1>Hello Next.js!</h1>
      </NavigationDrawer>
    </div>
  )
}
