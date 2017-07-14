import React from 'react';
import { translate } from 'react-i18next';
import i18n from '../i18n';

function MyComponennt({ t }) {
  return (
    <div>
      {t('extendedComponent')}
    </div>
  );
}

const Extended = translate('common')(MyComponennt);

export default Extended;
