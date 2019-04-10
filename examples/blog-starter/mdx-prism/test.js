const rehype = require("rehype");
const dedent = require("dedent");

const processHtml = (html, options) => {
  return rehype()
    .data("settings", { fragment: true })
    .use(require("./index"), options)
    .processSync(html)
    .toString();
};

test("finds code and highlights it", () => {
  const result = processHtml(dedent`
        <div>
            <pre><code class="language-jsx{4}">
            class Button extends React.Component {
              state = {
                textColor: slowlyCalculateTextColor(this.props.color)
              };
              render() {
                return (
                  <button
                    className={
                      "Button-" + this.props.color + " Button-text-" + this.state.textColor // 🔴 Stale on color prop updates
                    }
                  >
                    {this.props.children}
                  </button>
                );
              }
            }
            </code></pre>
        </div>
    `);

  expect(result).toMatchSnapshot();
});

module.exports = {
  processHtml
};
