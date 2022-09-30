


export default class {
    render() {
      return (
        <div>
          <p>test</p>
          <style jsx global>{`
            html {
                font-size: ${Typography.base.size.default};
                line-height: ${Typography.base.lineHeight};
            }
            @media ${Target.mediumPlus} {
                html {
                    font-size: ${Typography.base.size.mediumPlus};
                }
            }
            @media ${Target.largePlus} {
                html {
                    font-size: ${Typography.base.size.largePlus};
                }
            }
            `}
            </style>
        </div>
      )
    }
  }
  