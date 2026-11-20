import React from 'react';
import { render } from '@testing-library/react';
import { Image } from './index';

describe('Image component', () => {
  it('renders img element with correct props', () => {
    const { container } = render(
      <Image src="/test.jpg" alt="Test image" width={100} height={100} />
    );
    const img = container.querySelector('img');
    expect(img).toBeInTheDocument();
    expect(img).toHaveAttribute('src', '/test.jpg');
    expect(img).toHaveAttribute('alt', 'Test image');
    expect(img).toHaveAttribute('width', '100');
    expect(img).toHaveAttribute('height', '100');
  });

  it('does not pass blurWidth to img element', () => {
    const { container } = render(
      <Image
        src="/test.jpg"
        alt="Test image"
        blurWidth={50}
        blurHeight={50}
      />
    );
    const img = container.querySelector('img');
    expect(img).not.toHaveAttribute('blurWidth');
    expect(img).not.toHaveAttribute('blurHeight');
  });

  it('does not pass blurHeight to img element', () => {
    const { container } = render(
      <Image
        src="/test.jpg"
        alt="Test image"
        blurWidth={50}
        blurHeight={50}
      />
    );
    const img = container.querySelector('img');
    expect(img).not.toHaveAttribute('blurWidth');
    expect(img).not.toHaveAttribute('blurHeight');
  });

  it('passes other custom attributes to img element', () => {
    const { container } = render(
      <Image
        src="/test.jpg"
        alt="Test image"
        data-testid="custom-image"
        className="custom-class"
      />
    );
    const img = container.querySelector('img');
    expect(img).toHaveAttribute('data-testid', 'custom-image');
    expect(img).toHaveAttribute('class', 'custom-class');
  });
});