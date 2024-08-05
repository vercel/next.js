# swc-ast-explorer

A small binary to print out SWC Abtract Syntax Trees.

```shell
echo "console.log('hello')" | cargo run -p swc-ast-explorer
```

```rust
Script(
  Script {
    body: [
      Expr(
        ExprStmt {
          expr: Call(
            CallExpr {
              callee: Expr(
                Member(
                  MemberExpr {
                    obj: Ident(
                      Ident {
                        sym: Atom('console' type=inline),
                        optional: false,
                      },
                    ),
                    prop: Ident(
                      Ident {
                        sym: Atom('log' type=inline),
                        optional: false,
                      },
                    ),
                  },
                ),
              ),
              args: [
                ExprOrSpread {
                  spread: None,
                  expr: Lit(
                    Str(
                      Str {
                        value: Atom('hello' type=inline),
                        raw: Some(
                          "'hello'",
                        ),
                      },
                    ),
                  ),
                },
              ],
              type_args: None,
            },
          ),
        },
      ),
    ],
    shebang: None,
  },
)
```
