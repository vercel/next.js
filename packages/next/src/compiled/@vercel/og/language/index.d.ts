export declare class FontDetector {
    private rangesByLang;
    detect(text: string, fonts: string[]): Promise<{
        [lang: string]: string;
    }>;
    private detectSegment;
    private load;
    private addDetectors;
}
export declare const languageFontMap: {
    'ja-JP': string;
    'ko-KR': string;
    'zh-CN': string;
    'zh-TW': string;
    'zh-HK': string;
    'th-TH': string;
    'bn-IN': string;
    'ar-AR': string;
    'ta-IN': string;
    'ml-IN': string;
    'he-IL': string;
    'te-IN': string;
    devanagari: string;
    kannada: string;
    symbol: string[];
    math: string;
    unknown: string;
};
