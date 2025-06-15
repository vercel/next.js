'use client';

import { Content, Theme } from '@carbon/react';
import { useState } from 'react';

import TutorialHeader from './components/TutorialHeader/page';

export function Providers({ children }:any) {
  const [theme, updateTheme] = useState('white');
  const sendDataToParent = (value:any) => {
    updateTheme(value);
};

  return (
    <div>
      <Theme theme={theme}>
        <TutorialHeader sendDataToParent={sendDataToParent} />
        <Content>{children}</Content>
      </Theme>
      
    </div>
  );
}