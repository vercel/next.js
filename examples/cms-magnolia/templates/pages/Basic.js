import React from 'react';
import { EditableArea } from '@magnolia/react-editor';

export default function Basic(props) {
	const { main, extras, title } = props;

	return (
		<div className="Basic">
			<h2 className="hint">[Basic Page]</h2>
			<h1>{title || props.metadata['@name']}</h1>

			<main>
				<h2 className="hint">[Main Area]</h2>
				{main && <EditableArea className="Area" content={main} />}
			</main>

			<div className="Extras">
				<h2 className="hint">[Sercondary Area]</h2>
				{extras && <EditableArea className="Area" content={extras} />}
			</div>
		</div>
	);
}
