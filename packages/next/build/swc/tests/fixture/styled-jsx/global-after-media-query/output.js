import _JSXStyle from "styled-jsx/style";
import cn from "clsx";
import Link from "next/link";
function NavigationItem({ active , children , className , href , onClick , customLink , dataText , as  }) {
    return <span className={"jsx-a5d90bf16047119b" + " " + (cn({
        active
    }, className, "navigation-item") || "")}>

      {customLink ? children : <Link href={href} as={as}>

          <a onClick={onClick} data-text={dataText} className={"jsx-a5d90bf16047119b"}>

            {children}

          </a>

        </Link>}

      <_JSXStyle id={"a5d90bf16047119b"}>{".navigation-item.jsx-a5d90bf16047119b, .navigation-item.jsx-a5d90bf16047119b span {display:-webkit-box;\ndisplay:-webkit-flex;\ndisplay:-ms-flexbox;\ndisplay:flex;\n-webkit-align-items:center;\n-webkit-box-align:center;\n-ms-flex-align:center;\nalign-items:center}\n.navigation-item.jsx-a5d90bf16047119b a {color:var(--accents-5);\ndisplay:inline-block;\nfont-size:var(--font-size-small);\nline-height:var(--line-height-small);\nfont-weight:normal;\npadding:0 10px;\n-webkit-text-decoration:none;\ntext-decoration:none;\ntext-transform:capitalize;\n-webkit-transition:color 0.2s ease;\ntransition:color 0.2s ease;\nvertical-align:middle}\n.navigation-item.active.jsx-a5d90bf16047119b a, .navigation-item.jsx-a5d90bf16047119b a:hover {color:var(--geist-foreground);\n-webkit-text-decoration:none;\ntext-decoration:none}\n.navigation-item.active.jsx-a5d90bf16047119b a {font-weight:500;\ndisplay:block}\n.navigation-item.jsx-a5d90bf16047119b a::after {content:attr(data-text);\ncontent: attr(data-text) / '';\nheight:0;\ndisplay:block;\nvisibility:hidden;\noverflow:hidden;\n-webkit-user-select:none;\n-moz-user-select:none;\n-ms-user-select:none;\nuser-select:none;\npointer-events:none;\nfont-weight:500}\n@media speech {.navigation-item.jsx-a5d90bf16047119b:not(.active) a {display:none}}\n@media screen and (max-width:950px) {.navigation-item.jsx-a5d90bf16047119b a {font-size:var(--font-size-small);\nline-height:var(--line-height-small)}}"}</_JSXStyle>

    </span>;
}
export default NavigationItem;
