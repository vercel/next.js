import React from 'react';
import Head from 'next/head';
import Link from 'next/link';

const NAMES = ['Pat', 'Andrew', 'Bryan', 'David', 'Kent'];
const ProfileLink = ({ name }) => (
    <Link href={{ pathname: '/profile', query: { name } }} as={`/profile/${name}`}>
        <a>{name}</a>
    </Link>
);
ProfileLink.displayName = 'ProfileLink';

const IndexPage = () => (
    <>
        <Head>
            <title>Profiles</title>
        </Head>
        <h1>Profiles</h1>
        <ul>
            {NAMES.map((name, index) => (
                <li key={index}>
                    <ProfileLink {...{ name }} />
                </li>
            ))}
        </ul>
    </>
);
IndexPage.displayName = 'IndexPage';
export default IndexPage;
