import React from 'react';
import Link from "next/link";
import style from './index.css';

const Index = () => {
    return (
        <div className={style.main}>
            <Link href="/birds"><a>Birds Example</a></Link>
            <Link href="/boxes"><a>Boxes Example</a></Link>
        </div>
    );
};

export default Index;
