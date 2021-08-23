export default () => {
  const Element = 'div'
  return (
    <div>
      <div className="test" {...test.test} />
      <div className="test" {...test.test.test} />
      <div className="test" {...this.test.test} />
      <div data-test="test" />
      <div className={'test'} />
      <div className={`test`} />
      <div className={`test${true ? ' test2' : ''}`} />
      <div className={'test ' + test} />
      <div className={['test', 'test2'].join(' ')} />
      <div className={true && 'test'} />
      <div className={test ? 'test' : null} />
      <div className={test} />
      <div className={test && 'test'} />
      <div className={test && test('test')} />
      <div className={undefined} />
      <div className={null} />
      <div className={false} />
      <div className={'test'} data-test />
      <div data-test className={'test'} />
      <div className={'test'} data-test="test" />
      <div className={'test'} {...props} />
      <div className={'test'} {...props} {...rest} />
      <div className={`test ${test ? 'test' : ''}`} {...props} />
      <div className={test && test('test')} {...props} />
      <div className={test && test('test') && 'test'} {...props} />
      <div className={test && test('test') && test2('test')} {...props} />
      <div {...props} className={'test'} />
      <div {...props} {...rest} className={'test'} />
      <div {...props} className={'test'} {...rest} />
      <div {...props} />
      <div {...props} {...rest} />
      <div {...props} data-foo {...rest} />
      <div {...props} className={'test'} data-foo {...rest} />
      <div {...{ id: 'foo' }} />
      <div {...{ className: 'foo' }} />
      <div {...{ className: 'foo' }} className="test" />
      <div className="test" {...{ className: 'foo' }} />
      <div {...{ className: 'foo' }} {...bar} />
      <div {...{ className: 'foo' }} {...bar} className="test" />
      <div className="test" {...{ className: 'foo' }} {...bar} />
      <div className="test" {...{ className: props.className }} />
      <div className="test" {...{ className: props.className }} {...bar} />
      <div className="test" {...bar} {...{ className: props.className }} />
      <div className="test" {...bar()} />
      <Element />
      <Element className="test" />
      <Element {...props} />
      <style jsx>{'div { color: red }'}</style>
    </div>
  )
}
