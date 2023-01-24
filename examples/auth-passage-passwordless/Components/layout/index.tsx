// import custom components

import { ReactNode } from "react";
import Footer from "./footer";
import Header from "./header";
import styles from "../../styles/App.module.css"


interface LayoutProps {
    children?: ReactNode;
};


export default function Layout({ children, ...props }: LayoutProps) {
    return (
        <>
            <Header />
            <div className={styles.mainContainer}>
                <main>
                    {children}
                </main>
            </div>
            <Footer />
        </>
    );
}