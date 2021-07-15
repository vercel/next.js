export const light = {
    text: "#000",
    body: "#fff",
};

export const dark = {
    body: "#000",
    text: "#fff",
};

type Theme = typeof light & typeof dark;

declare module "styled-components" {
    export interface DefaultTheme extends Theme {}
}
