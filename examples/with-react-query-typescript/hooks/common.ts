import {  useRouter } from "next/router";
import { useState, useEffect } from "react";

// Hook to check if router.query are set
export const useRouterReady = () => {
  const router = useRouter();
  const [isRouterReady, setIsRouterReady] = useState(false);

  useEffect(() => {
    if (router.isReady) {
      setIsRouterReady(true);
    }
  }, [router.isReady]);
  
  // if router.isFallback is true, router.query is empty even when router.isReady is true
  if(router.isFallback) {
    return {
      isRouterReady: !router.isFallback,
      router
    }
  }
  
  return {
    isRouterReady,
    router
  }
}