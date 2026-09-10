import React from 'react';
import { EditableArea } from '@magnolia/react-editor';

export default function List({ items, metadata }) {

	return (
		<>
			<div className="hint">[LIST]</div>
			<ul className="List">
				<EditableArea
					content={items}
					parentTemplateId={metadata['mgnl:template']}
				/>
			</ul>
		</>
	);
}
