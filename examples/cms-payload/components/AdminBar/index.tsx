'use client';

import React, { useState } from 'react';
import { PayloadMeUser, PayloadAdminBarProps, PayloadAdminBar } from 'payload-admin-bar';
import { Gutter } from '../Gutter';
import classes from './index.module.scss'

const Title: React.FC = () => (
  <span>
    Payload + Vercel
  </span>
)

export const AdminBar: React.FC<{
  adminBarProps: PayloadAdminBarProps
}> = (props) => {
  const {
    adminBarProps
  } = props;

  const [user, setUser] = useState<PayloadMeUser>();

  return (
    <div
      className={[
        classes.adminBar,
        user && classes.show
      ].filter(Boolean).join(' ')}
    >
      <Gutter className={classes.blockContainer} >
        <PayloadAdminBar
          {...adminBarProps}
          cmsURL={process.env.NEXT_PUBLIC_APP_URL}
          onAuthChange={setUser}
          className={classes.payloadAdminBar}
          classNames={{
            user: classes.user,
            logo: classes.logo,
            controls: classes.controls,
          }}
          logo={<Title />}
          style={{
            position: 'relative',
            zIndex: 'unset',
            padding: 0,
            backgroundColor: 'transparent'
          }}
        />
      </Gutter>
    </div>
  )
}
