declare module '@capsizecss/metrics/nanumGothic' {
  interface NanumGothicMetrics {
    familyName: string;
    category: string;
    capHeight: number;
    ascent: number;
    descent: number;
    lineGap: number;
    unitsPerEm: number;
    xHeight: number;
    xAvgCharWidth: number;
    xAvgLowercase: number;
    xAvgWeightedOs2: number;
    xAvgWeightedWiki: number;
    xAvgLetterFrequency: number;
  }
  export const fontMetrics: NanumGothicMetrics;
  export default fontMetrics;
}
