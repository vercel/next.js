import type { ReactElement } from 'react';
import type { ImageResponseOptions, FigmaImageResponseProps } from './types';
export declare class ImageResponse extends Response {
    constructor(element: ReactElement, options?: ImageResponseOptions);
}
export declare const experimental_FigmaImageResponse: (props: FigmaImageResponseProps) => Promise<ImageResponse>;
export type EdgeImageResponse = typeof ImageResponse;
