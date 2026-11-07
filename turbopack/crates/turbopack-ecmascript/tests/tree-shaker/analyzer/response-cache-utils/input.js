import { CachedRouteKind, IncrementalCacheKind } from './types';
import RenderResult from '../render-result';
import { RouteKind } from '../route-kind';
import { HTML_CONTENT_TYPE_HEADER } from '../../lib/constants';
export async function fromResponseCacheEntry(cacheEntry) {
    var _cacheEntry_value, _cacheEntry_value1;
    return {
        ...cacheEntry,
        value: ((_cacheEntry_value = cacheEntry.value) == null ? void 0 : _cacheEntry_value.kind) === CachedRouteKind.PAGES ? {
            kind: CachedRouteKind.PAGES,
            html: await cacheEntry.value.html.toUnchunkedString(true),
            pageData: cacheEntry.value.pageData,
            headers: cacheEntry.value.headers,
            status: cacheEntry.value.status
        } : ((_cacheEntry_value1 = cacheEntry.value) == null ? void 0 : _cacheEntry_value1.kind) === CachedRouteKind.APP_PAGE ? {
            kind: CachedRouteKind.APP_PAGE,
            html: await cacheEntry.value.html.toUnchunkedString(true),
            postponed: cacheEntry.value.postponed,
            rscData: cacheEntry.value.rscData,
            headers: cacheEntry.value.headers,
            status: cacheEntry.value.status,
            segmentData: cacheEntry.value.segmentData
        } : cacheEntry.value
    };
}
export async function toResponseCacheEntry(response) {
    var _response_value, _response_value1;
    if (!response) return null;
    return {
        isMiss: response.isMiss,
        isStale: response.isStale,
        cacheControl: response.cacheControl,
        isFallback: response.isFallback,
        value: ((_response_value = response.value) == null ? void 0 : _response_value.kind) === CachedRouteKind.PAGES ? {
            kind: CachedRouteKind.PAGES,
            html: RenderResult.fromStatic(response.value.html, HTML_CONTENT_TYPE_HEADER),
            pageData: response.value.pageData,
            headers: response.value.headers,
            status: response.value.status
        } : ((_response_value1 = response.value) == null ? void 0 : _response_value1.kind) === CachedRouteKind.APP_PAGE ? {
            kind: CachedRouteKind.APP_PAGE,
            html: RenderResult.fromStatic(response.value.html, HTML_CONTENT_TYPE_HEADER),
            rscData: response.value.rscData,
            headers: response.value.headers,
            status: response.value.status,
            postponed: response.value.postponed,
            segmentData: response.value.segmentData
        } : response.value
    };
}
export function routeKindToIncrementalCacheKind(routeKind) {
    switch(routeKind){
        case RouteKind.PAGES:
            return IncrementalCacheKind.PAGES;
        case RouteKind.APP_PAGE:
            return IncrementalCacheKind.APP_PAGE;
        case RouteKind.IMAGE:
            return IncrementalCacheKind.IMAGE;
        case RouteKind.APP_ROUTE:
            return IncrementalCacheKind.APP_ROUTE;
        case RouteKind.PAGES_API:
            // Pages Router API routes are not cached in the incremental cache.
            throw Object.defineProperty(new Error(`Unexpected route kind ${routeKind}`), "__NEXT_ERROR_CODE", {
                value: "E64",
                enumerable: false,
                configurable: true
            });
        default:
            return routeKind;
    }
}
