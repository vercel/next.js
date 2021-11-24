import * as React from 'react';
import {FormattedRelativeTime, useIntl} from 'react-intl';
import Layout from '../components/Layout';

export default function About() {
  const intl = useIntl();
  return (
    <Layout title={intl.formatMessage({defaultMessage: 'About'})}>
      <p>
        <FormattedRelativeTime numeric="auto" value={1} unit="hour" />
      </p>
    </Layout>
  );
}
