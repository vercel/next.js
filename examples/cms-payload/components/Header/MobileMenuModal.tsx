import React from 'react';
import { Modal } from "@faceless-ui/modal";
import { HeaderBar } from ".";
import { MainMenu } from "../../payload-types"
import { Gutter } from "../Gutter";
import { CMSLink } from "../Link";

import classes from './mobileMenuModal.module.scss';

type Props = {
  navItems: MainMenu['navItems'];
}

export const slug = 'menu-modal';

export const MobileMenuModal: React.FC<Props> = ({ navItems }) => {
  return (
    <Modal slug={slug} className={classes.mobileMenuModal}>
      <HeaderBar />

      <Gutter>
        <div className={classes.mobileMenuItems}>
          {navItems.map(({ link }, i) => {
            return (
              <CMSLink className={classes.menuItem} key={i} {...link} />
            )
          })}
        </div>
      </Gutter>
    </Modal>
  )
}