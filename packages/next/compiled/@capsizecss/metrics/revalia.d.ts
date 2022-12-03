declare module '@capsizecss/metrics/revalia' {
  interface RevaliaMetrics {
    familyName: string;
    category: string;
    capHeight: number;
    ascent: number;
    lineGap: number;
    unitsPerEm: number;
    xHeight: number;
    xAvgCharWidth: number;
    xAvgLowercase: number;
    xAvgWeightedOs2: number;
    xAvgWeightedWiki: number;
    xAvgLetterFrequency: number;
  }
  export const fontMetrics: RevaliaMetrics;
  export default fontMetrics;
}
