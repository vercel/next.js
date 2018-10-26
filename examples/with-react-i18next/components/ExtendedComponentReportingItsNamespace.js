import React from 'react';
import { withNamespaces } from 'react-i18next';

function MyComponent({ t }) {
  return <p>{t('extendedComponentReportingItsNamespace')}</p>;
}

const Extended = withNamespaces('unknownGetReported')(MyComponent);

export default Extended;
