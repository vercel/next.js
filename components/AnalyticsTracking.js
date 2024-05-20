import React, { useEffect } from 'react';
import { useRouter } from 'next/router';

const AnalyticsTracking = () => {
  const router = useRouter();

  useEffect(() => {
    const handleRouteChange = (url) => {
      console.log('App is changing to: ', url);
      // Here you can integrate with your analytics platform
      // For example, sending page views on route change
    };

    router.events.on('routeChangeComplete', handleRouteChange);
    return () => {
      router.events.off('routeChangeComplete', handleRouteChange);
    };
  }, [router.events]);

  return null; // This component does not render anything
};

export default AnalyticsTracking;
