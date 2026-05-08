import path from 'node:path'

import { CLIENT_STATIC_FILES_PATH } from '../shared/lib/constants'
import { OFFLINE_NAVIGATION_SERVICE_WORKER } from '../shared/lib/offline-navigation'

export function getOfflineNavigationServiceWorkerFilePath(): string {
  return path.join(CLIENT_STATIC_FILES_PATH, OFFLINE_NAVIGATION_SERVICE_WORKER)
}

// Offline navigations use a generated, app-local service worker. It caches the
// bootstrap manifest and fallback document during installation; document
// navigations still go to the network until fallback handling is enabled.
export function createOfflineNavigationServiceWorker({
  cacheNamespace,
  manifestHref,
}: {
  cacheNamespace: string
  manifestHref: string
}): string {
  const metadata = JSON.stringify({
    cacheNamespace,
    manifestHref,
    source: 'offline-navigation-service-worker',
  })

  return `self.__NEXT_OFFLINE_NAVIGATION_SW=${metadata};
const CACHE_PREFIX='next-offline-navigation-v1:';
function withDeploymentQuery(href){
  const url=new URL(href,self.location.origin);
  const deploymentParams=new URLSearchParams(self.location.search);
  deploymentParams.forEach((value,key)=>{
    if(!url.searchParams.has(key)){
      url.searchParams.set(key,value);
    }
  });
  return url.href;
}
async function fetchRequiredResource(href){
  const response=await fetch(withDeploymentQuery(href),{cache:'no-store'});
  if(!response.ok){
    throw new Error('Failed to cache offline navigation resource: '+href);
  }
  return response;
}
async function cacheOfflineNavigationResources(){
  const metadata=self.__NEXT_OFFLINE_NAVIGATION_SW;
  const cache=await caches.open(metadata.cacheNamespace);
  const manifestResponse=await fetchRequiredResource(metadata.manifestHref);
  const manifest=await manifestResponse.clone().json();
  await cache.put(metadata.manifestHref,manifestResponse);
  const fallbackResponse=await fetchRequiredResource(manifest.fallbackDocument.href);
  await cache.put(manifest.fallbackDocument.href,fallbackResponse);
}
self.addEventListener('install',(event)=>{
  event.waitUntil((async()=>{
    await cacheOfflineNavigationResources();
    await self.skipWaiting();
  })());
});
self.addEventListener('activate',(event)=>{
  event.waitUntil((async()=>{
    const metadata=self.__NEXT_OFFLINE_NAVIGATION_SW;
    const cacheNames=await caches.keys();
    await Promise.all(cacheNames.map((cacheName)=>{
      if(cacheName.startsWith(CACHE_PREFIX)&&cacheName!==metadata.cacheNamespace){
        return caches.delete(cacheName);
      }
    }));
    await self.clients.claim();
  })());
});
`
}
