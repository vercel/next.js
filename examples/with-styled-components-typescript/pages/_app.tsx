import React, { useState } from "react";
import { AppProps } from "next/app";
import { ThemeProvider } from "styled-components";
import { GlobalStyle } from "../app/css/GlobalStyle";
import { light, dark } from "../app/css/theme";
import { ThemeSwitch } from "../app/components/ThemeSwitch";

const App: React.FC<AppProps> = ({ Component, pageProps }) => {
    const [theme, setTheme] = useState<"light" | "dark">("light");

    const toggleTheme = () => setTheme("dark" === theme ? "light" : "dark");

    return (
        <ThemeProvider theme={"dark" === theme ? dark : light}>
            <GlobalStyle />
            <Component {...pageProps} />
            <ThemeSwitch onClick={toggleTheme}>{"dark" === theme ? "Dark" : "Light"}</ThemeSwitch>
        </ThemeProvider>
    );
};

export default App;
