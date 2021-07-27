import React from 'react'
import { css } from '@emotion/react';
import MainLayout from '@components/layouts/MainLayout';

const Home = () => {
	const box_color = '#FFCB11'
	const box_width = 200;
	const box_height = 300;

	return (
		<MainLayout title="Home" css={styles.page}>

			<div css={styles.hero}>
				<h1>Hello World</h1>
				<p>this element can be styled by nesting style to its parent</p>
			</div>

			<div css={styles.body({ width: box_width, height: box_height, color: box_color })}>
				<div className="box-custom">square</div>
				<p>and this is example of props-passing to css emotion</p>
				<p>The css props docs : <a href="https://emotion.sh/docs/css-prop">https://emotion.sh/docs/css-prop</a></p>
			</div>

		</MainLayout>
	)
}

const styles = {
	page: css`
		padding-top: 48px;
		background: aliceblue;
	`,
	hero: css`
		display: flex;
		justify-content: center;
		align-items: center;
		flex-direction: column;
		width: 100%;
		
		h1 {
			font-size: 32px;
			color: black;
		}
	`,
	body: ({ width, height, color }) => css`
		display: flex;
		justify-content: center;
		align-items: center;
		flex-direction: column;
		width: 100%;

		.box-custom {
			width: ${width}px;
			height: ${height}px;
			background: ${color};
		}
	`,
}

export default Home
