import React from 'react';
import { EditableArea } from '@magnolia/react-editor';
import { useState } from 'react';

export default function Expander(props) {
	const [isCollapsed, setIsCollapsed] = useState(true);
	const expanderItems = props.expanderItems;

	const toggle = (event) => {
		setIsCollapsed(!isCollapsed);
		event.preventDefault();
	};

	return (
		<div className="expander">
			<div
				onClick={toggle}
				className={
					isCollapsed
						? 'open expanderHeader'
						: 'closed expanderHeader'
				}
			>
				Expander
				<svg
					className="expanderIcon"
					focusable="false"
					viewBox="0 0 24 24"
					aria-hidden="true"
					role="presentation"
				>
					<path d="M16.59 8.59L12 13.17 7.41 8.59 6 10l6 6 6-6z"></path>
				</svg>
			</div>

			{!isCollapsed && (
				<div>
					<div className="hint">[EXPANDER OPENED]</div>
					<EditableArea
						content={expanderItems}
						parentTemplateId={props.metadata['mgnl:template']}
					/>
				</div>
			)}
		</div>
	);
}
