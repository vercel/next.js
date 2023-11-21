import { getProps } from './utils';

describe('getProps', () => {
	it('should return an object with the resolvedUrl', async () => {
		const resolvedUrl = '/test';
		const props = await getProps(resolvedUrl);
		expect(props).toEqual(expect.objectContaining({ resolvedUrl }));
	});
});
