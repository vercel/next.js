'use client';

import { Content, Theme } from '@carbon/react';
import { useState } from 'react';

import TutorialHeader from './components/TutorialHeader/TutorialHeader';

export function Providers({ children }) {
  const [theme, updateTheme] = useState('white');
  const sendDataToParent = (value) => {
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