// mock for React.createElement

export default {
	createElement(type, props, children){
		return {
			type, props, children
		};
	}
}