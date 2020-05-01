import React from 'react';
import {useLocale} from "../lib/useLocale";
import Link from "next/link";
import fetchLocale from "../lib/fetchLocale";

export default function IndexPage() {
    const {dictionary, changeLocale} = useLocale();
    return (
        <div>
            <h1>{dictionary.welcome}</h1>
            <p>{dictionary.description}</p>
            <button onClick={() => changeLocale("de")}>
                Change to de
            </button>
            <br/>
            <button onClick={() => changeLocale("en")}>
                Change to en
            </button>
            <br/>
            <br/>
            <Link href={"/"}>
                <a>Index</a>
            </Link>
        </div>
    )
}

export async function getStaticProps() {
    const langDict = await fetchLocale("dashboard")
    return {
        props: {
            langDict
        }
    }
}

