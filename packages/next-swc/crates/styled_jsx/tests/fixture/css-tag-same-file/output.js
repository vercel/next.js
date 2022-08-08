import _JSXStyle from "next/dist/shared/lib/styled-jsx";
export default (({ children  })=><div className={`jsx-${styles.__hash}`}>

    <p className={`jsx-${styles.__hash}`}>{children}</p>

    <_JSXStyle id={styles.__hash}>{styles}</_JSXStyle>

  </div>);
const styles = new String("p.jsx-556239d258b6d66a{color:red}");
styles.__hash = "556239d258b6d66a";
class Test extends React.Component {
    render() {
        return <div className={`jsx-${styles.__hash}`}>

        <p className={`jsx-${styles.__hash}`}>{this.props.children}</p>

        <_JSXStyle id={styles.__hash}>{styles}</_JSXStyle>

      </div>;
    }
}
