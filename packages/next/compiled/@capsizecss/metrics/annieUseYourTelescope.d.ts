declare module '@capsizecss/metrics/annieUseYourTelescope' {
  interface AnnieUseYourTelescopeMetrics {
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
  export const fontMetrics: AnnieUseYourTelescopeMetrics;
  export default fontMetrics;
}
