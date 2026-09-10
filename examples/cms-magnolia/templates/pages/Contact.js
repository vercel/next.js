import React from 'react';
import { EditableArea } from '@magnolia/react-editor';

export default function Contact(props) {
	const { main, title } = props;
	const boxStyle = {
		background: '#eaf7f5',
		padding: '20px',
	};

	return (
		<div className="Contact">
			<h2 className="hint">[Contact Page]</h2>
			<div className="box" style={boxStyle}>
				<h1>{title || 'Nulla vitae elit libero, a pharetra augue.'}</h1>
			</div>
			{main && <EditableArea content={main} />}
		</div>
	);
}
