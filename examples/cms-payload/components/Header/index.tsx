import { ModalToggler } from '@faceless-ui/modal';
import Link from 'next/link';
import React from 'react';
import { MainMenu } from '../../payload-types';
import { Gutter } from '../Gutter';
import { MenuIcon } from '../icons/Menu';
import { CMSLink } from '../Link';
import { Logo } from '../Logo';
import { MobileMenuModal, slug as menuModalSlug } from './MobileMenuModal';

import classes from './index.module.scss';

type HeaderBarProps = {
  children?: React.ReactNode;
}
export const HeaderBar: React.FC<HeaderBarProps> = ({ children }) => {
  return (
    <header className={classes.header}>
      <Gutter className={classes.wrap}>
        <Link href="/">
          <Logo />
        </Link>

        {children}

        <ModalToggler slug={menuModalSlug} className={classes.mobileMenuToggler}>
          <MenuIcon />
        </ModalToggler>
      </Gutter>
    </header>
  )
}

export const Header: React.FC<{ mainMenu: MainMenu }> = ({ mainMenu }) => {
  const navItems = mainMenu?.navItems || [];

  return (
    <>
      <HeaderBar>
        <nav className={classes.nav}>
          {navItems.map(({ link }, i) => {
            return (
              <CMSLink key={i} {...link} />
            )
          })}
        </nav>
      </HeaderBar>

      <MobileMenuModal navItems={navItems} />
    </>
  )
}
