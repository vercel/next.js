declare module '@capsizecss/metrics/pressStart2P' {
  interface PressStart2PMetrics {
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
  export const fontMetrics: PressStart2PMetrics;
  export default fontMetrics;
}
