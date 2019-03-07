import React from 'react';
import Head from 'next/head';
const ProfilePage = ({ name }) => (
    <>
        <Head>
            <title>{name} | Profile</title>
        </Head>
        <div>
            <h1>{name}</h1>
            <p>
                Lorem ipsum dolor sit amet, consectetur adipiscing elit, sed do eiusmod tempor incididunt ut labore et
                dolore magna aliqua.
            </p>
        </div>
    </>
);

ProfilePage.displayName = 'ProfilePage';
ProfilePage.getInitialProps = ({ query: { name } }) => ({ name });
export default ProfilePage;
