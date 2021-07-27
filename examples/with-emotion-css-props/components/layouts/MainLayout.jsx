import React from 'react';
import Head from 'next/head';

const MainLayout = ({ children, className, title }) => {
	//one caveat is that when you pass css= at index.js, here it received as className props

	return (
		<>
			<Head>
				{title && <title>{title} — New Project</title>}
			</Head>
			<main className={className}>
				{children}
			</main>
		</>
	);
};

export default MainLayout;