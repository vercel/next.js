'use client';

import {
  Header,
  HeaderContainer,
  HeaderName,
  HeaderNavigation,
  HeaderMenuButton,
  HeaderMenuItem,
  HeaderGlobalBar,
  HeaderGlobalAction,
  SkipToContent,
  SideNav,
  SideNavItems,
  HeaderSideNavItems,
  RadioButton,
  RadioButtonGroup
} from '@carbon/react';
import { Switcher, Notification, UserAvatar } from '@carbon/icons-react';
import { useState } from 'react';

import Link from 'next/link';

const TutorialHeader = (props) => (
  //const [theme, updateTheme] = useState('');

  <HeaderContainer
    render={({ isSideNavExpanded, onClickSideNavExpand }) => (
      <Header aria-label="Carbon Tutorial">
        <SkipToContent />
        <HeaderMenuButton
          aria-label="Open menu"
          onClick={onClickSideNavExpand}
          isActive={isSideNavExpanded}
        />
        <Link href="/" passHref legacyBehavior>
          <HeaderName prefix="IBM">Carbon Tutorial</HeaderName>
        </Link>
        <HeaderNavigation aria-label="Carbon Tutorial">
          <Link href="/repos" passHref legacyBehavior>
            <HeaderMenuItem>Repositories</HeaderMenuItem>
          </Link>
        </HeaderNavigation>
        <SideNav
          aria-label="Side navigation"
          expanded={isSideNavExpanded}
          isPersistent={false}
        >
          <SideNavItems>
            <HeaderSideNavItems>
              <Link href="/repos" passHref legacyBehavior>
                <HeaderMenuItem>Repositories</HeaderMenuItem>
              </Link>
            </HeaderSideNavItems>
          </SideNavItems>
        </SideNav>
        <HeaderGlobalBar>
        <HeaderGlobalBar>
                <div className={'bx--cloud-header-list'}>
                    <RadioButtonGroup
                        name={'theme-selection'}
                        legendText={'Choose a theme'}
                        defaultSelected={'radio-1'}
                        data-testid={'theme-selection'}
                        onChange={(value) => {
                            // eslint-disable-next-line react/prop-types
                            props.sendDataToParent(value);
                        }}>
                        <RadioButton labelText={'White'} value={'white'} id={'radio-1'} />
                        <RadioButton labelText={'g10'} value={'g10'} id={'radio-2'} />
                        <RadioButton labelText={'g80'} value={'g90'} id={'radio-3'} />
                        <RadioButton labelText={'g100'} value={'g100'} id={'radio-4'} />
                    </RadioButtonGroup>
                </div>
            </HeaderGlobalBar>
         
          <HeaderGlobalAction
            aria-label="Notifications"
            tooltipAlignment="center"
          >
            
            <Notification size={20} />
          </HeaderGlobalAction>
          <HeaderGlobalAction
            aria-label="User Avatar"
            tooltipAlignment="center"
          >
            <UserAvatar size={20} />
          </HeaderGlobalAction>
          <HeaderGlobalAction aria-label="App Switcher" tooltipAlignment="end">
            <Switcher size={20} />
          </HeaderGlobalAction>
        </HeaderGlobalBar>
      </Header>
    )}
  />
);

export default TutorialHeader;