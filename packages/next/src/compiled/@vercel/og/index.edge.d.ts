import type { ReactElement } from 'next/dist/compiled/react';
import type { ImageResponseOptions, FigmaImageResponseProps } from './types';
export declare class ImageResponse extends Response {
    constructor(element: ReactElement, options?: ImageResponseOptions);
}
export declare const experimental_FigmaImageResponse: (props: FigmaImageResponseProps) => Promise<ImageResponse>;
export declare type EdgeImageResponse = typeof ImageResponse;
