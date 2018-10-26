import React from 'react';
import { NamespacesConsumer } from 'react-i18next';
import i18nInstance from '../i18n';

export const withI18next = (namespaces = ['translation']) => ComposedComponent => {
  const reportedNamespaces = typeof namespaces === 'string' ? [namespaces] : namespaces;

  const addReportedNamespace = ns => {
    if (reportedNamespaces.indexOf(ns) < 0) reportedNamespaces.push(ns);
  };

  const Extended = ({ i18n, ...rest }) => {
    // on client we only get a serialized i18n instance
    // as we do not have to use the one on req we just use the one instance
    const finalI18n = i18n || i18nInstance;

    return (
      <NamespacesConsumer
        i18n={finalI18n}
        reportNS={addReportedNamespace}
        ns={namespaces}
        {...rest}
        wait={process.browser}
      >
        {t => <ComposedComponent t={t} {...rest} />}
      </NamespacesConsumer>
    );
  };

  Extended.getInitialProps = async ctx => {
    const composedInitialProps = ComposedComponent.getInitialProps
      ? await ComposedComponent.getInitialProps(ctx)
      : {};

    const i18nInitialProps = i18nInstance.getInitialProps(ctx.req, reportedNamespaces);

    return {
      ...composedInitialProps,
      ...i18nInitialProps,
    };
  };

  return Extended;
};
