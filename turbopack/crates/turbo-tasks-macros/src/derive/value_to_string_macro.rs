use indexmap::IndexSet;
use proc_macro::TokenStream;
use proc_macro2::TokenStream as TokenStream2;
use quote::{format_ident, quote};
use syn::{
    Attribute, Data, DeriveInput, Expr, ExprLit, Fields, Lit, Token, Variant, parse_macro_input,
    punctuated::Punctuated,
};

/// The parsed form of a `#[value_to_string(...)]` attribute.
enum AttrForm {
    /// `#[value_to_string("{field} text")]` — format string with auto-field references.
    FormatAutoFields(String),
    /// `#[value_to_string("fmt {}", expr1, expr2)]` — format string with explicit expressions.
    FormatExprs(String, Vec<Expr>),
    /// `#[value_to_string(expr)]` — single expression delegation.
    DirectExpr(Expr),
}

/// A parsed field reference from a format string.
#[derive(PartialEq, Eq, Hash)]
struct Field {
    /// The original field name as it appears in the format string (e.g., "0", "name").
    name: String,
    /// The variable name used in generated code.
    /// Tuple fields like `{0}` are prefixed with `_` because bare numeric identifiers
    /// are not valid Rust identifiers (e.g., "0" becomes `_0`).
    var: syn::Ident,
    /// Whether this field is a positional tuple field (all-digit name).
    is_positional: bool,
}

impl Field {
    fn new(name: String) -> Self {
        let is_positional = name.chars().all(|c| c.is_ascii_digit());
        let var = if is_positional {
            format_ident!("_{}", name)
        } else {
            format_ident!("{}", name)
        };
        Field {
            name,
            var,
            is_positional,
        }
    }

    /// Token stream to access this field on `self` (e.g., `self.0` or `self.name`).
    fn struct_access(&self) -> TokenStream2 {
        if self.is_positional {
            let idx = syn::Index::from(self.name.parse::<usize>().unwrap());
            quote! { self.#idx }
        } else {
            let ident = &self.var;
            quote! { self.#ident }
        }
    }
}

/// Derive macro for `ValueToString`.
///
/// Supports four forms:
/// - No attribute: delegates to `Display::to_string(self)`
/// - `#[value_to_string("{field} text")]`: auto-field references resolved via `ValueToStringify`
/// - `#[value_to_string("fmt {}", expr)]`: format string with explicit expression arguments
/// - `#[value_to_string(expr)]`: direct expression delegation
///
/// For enums, each variant can have its own attribute. Variants without one default to their name.
pub fn derive_value_to_string(input: TokenStream) -> TokenStream {
    let derive_input = parse_macro_input!(input as DeriveInput);
    let ident = &derive_input.ident;

    match &derive_input.data {
        Data::Struct(data) => {
            let attr = find_attr(&derive_input.attrs);
            generate_struct_impl(ident, &data.fields, attr)
        }
        Data::Enum(data) => {
            let attr = find_attr(&derive_input.attrs);
            if attr.is_some() {
                // Top-level attribute on enum: treat like a struct (self-based expression).
                generate_struct_impl(ident, &Fields::Unit, attr)
            } else {
                generate_enum_impl(ident, &data.variants)
            }
        }
        Data::Union(_) => {
            syn::Error::new_spanned(&derive_input, "ValueToString cannot be derived for unions")
                .to_compile_error()
                .into()
        }
    }
}

/// Wrap a function body in the `#[turbo_tasks::value_impl] impl ValueToString` boilerplate.
fn wrap_impl(ident: &syn::Ident, is_async: bool, body: TokenStream2) -> TokenStream {
    let async_kw = if is_async {
        quote! { async }
    } else {
        quote! {}
    };
    let ret_ty = if is_async {
        quote! { anyhow::Result<turbo_tasks::Vc<turbo_rcstr::RcStr>> }
    } else {
        quote! { turbo_tasks::Vc<turbo_rcstr::RcStr> }
    };
    quote! {
        #[turbo_tasks::value_impl]
        impl turbo_tasks::ValueToString for #ident {
            #[turbo_tasks::function]
            #async_kw fn to_string(&self) -> #ret_ty {
                #body
            }
        }
    }
    .into()
}

fn find_attr(attrs: &[Attribute]) -> Option<AttrForm> {
    for attr in attrs {
        if attr.path().is_ident("value_to_string") {
            match parse_attr(attr) {
                Ok(form) => return Some(form),
                Err(e) => {
                    e.span()
                        .unwrap()
                        .error(format!("invalid value_to_string attribute: {e}"))
                        .emit();
                    return None;
                }
            }
        }
    }
    None
}

fn parse_attr(attr: &Attribute) -> syn::Result<AttrForm> {
    let args: Punctuated<Expr, Token![,]> = attr.parse_args_with(Punctuated::parse_terminated)?;
    let mut iter = args.into_iter();

    let first = iter
        .next()
        .ok_or_else(|| syn::Error::new_spanned(attr, "expected format string or expression"))?;

    if let Expr::Lit(ExprLit {
        lit: Lit::Str(s), ..
    }) = &first
    {
        let fmt = s.value();
        let rest: Vec<Expr> = iter.collect();

        // Detect single-field patterns early and transform to DirectExpr:
        // - `"{x}"` with no args → `DirectExpr(self.x)`
        // - `"{}"` with one arg  → `DirectExpr(arg)`
        if rest.is_empty() {
            if let Some(expr) = try_single_field_self_expr(&fmt) {
                return Ok(AttrForm::DirectExpr(expr));
            }
            Ok(AttrForm::FormatAutoFields(fmt))
        } else if fmt == "{}" && rest.len() == 1 {
            Ok(AttrForm::DirectExpr(rest.into_iter().next().unwrap()))
        } else {
            Ok(AttrForm::FormatExprs(fmt, rest))
        }
    } else {
        if let Some(extra) = iter.next() {
            return Err(syn::Error::new_spanned(
                extra,
                "expected format string as first argument when providing multiple arguments",
            ));
        }
        Ok(AttrForm::DirectExpr(first))
    }
}

/// If `fmt` is exactly `{field_name}` (single field, no format specifier, no surrounding text),
/// returns a `self.field_name` expression. This lets us skip `format!` entirely and delegate
/// directly to `ValueToStringify::to_stringify`.
fn try_single_field_self_expr(fmt: &str) -> Option<Expr> {
    if fmt.starts_with('{') && fmt.ends_with('}') && fmt.len() > 2 {
        let inner = &fmt[1..fmt.len() - 1];
        if !inner.contains('{') && !inner.contains('}') && !inner.contains(':') {
            return Some(if inner.chars().all(|c| c.is_ascii_digit()) {
                let idx = syn::Index::from(inner.parse::<usize>().unwrap());
                syn::parse_quote!(self.#idx)
            } else {
                let ident = format_ident!("{}", inner);
                syn::parse_quote!(self.#ident)
            });
        }
    }
    None
}

/// Extract `{field}` references from a format string. Returns the transformed format string
/// (with positional `{0}` → `{_0}` for valid identifiers) and a deduplicated list of fields.
///
/// Format specifiers (e.g., `{field:?}`, `{field:.2}`) are preserved in the transformed string
/// but stripped from the field name used for resolution.
fn parse_format_fields(fmt: &str) -> (String, Vec<Field>) {
    let mut fields: IndexSet<Field> = IndexSet::new();
    let mut transformed = String::new();

    let chars: Vec<char> = fmt.chars().collect();
    let mut i = 0;

    while i < chars.len() {
        if chars[i] == '{' {
            if i + 1 < chars.len() && chars[i + 1] == '{' {
                transformed.push_str("{{");
                i += 2;
                continue;
            }
            i += 1;
            let start = i;
            while i < chars.len() && chars[i] != '}' {
                i += 1;
            }
            let full_contents: String = chars[start..i].iter().collect();
            i += 1;

            // Split off any format specifier (e.g., "field:?" → name="field", spec=":?")
            let (field_name, spec) = match full_contents.find(':') {
                Some(colon) => (&full_contents[..colon], &full_contents[colon..]),
                None => (full_contents.as_str(), ""),
            };

            let field = Field::new(field_name.to_owned());

            transformed.push('{');
            transformed.push_str(&field.var.to_string());
            transformed.push_str(spec);
            transformed.push('}');

            fields.insert(field);
        } else if chars[i] == '}' && i + 1 < chars.len() && chars[i + 1] == '}' {
            transformed.push_str("}}");
            i += 2;
        } else {
            transformed.push(chars[i]);
            i += 1;
        }
    }

    (transformed, fields.into_iter().collect())
}

/// Generate `let var = ValueToStringify::to_stringify([&]access).await?;`
/// `add_ref` adds `&` for struct context (owned values); enum context already has references.
fn generate_resolve(var_name: &syn::Ident, access: &TokenStream2, add_ref: bool) -> TokenStream2 {
    if add_ref {
        quote! { let #var_name = turbo_tasks::display::ValueToStringify::to_stringify(&(#access)).await?; }
    } else {
        quote! { let #var_name = turbo_tasks::display::ValueToStringify::to_stringify(#access).await?; }
    }
}

fn generate_struct_impl(
    ident: &syn::Ident,
    _fields: &Fields,
    attr: Option<AttrForm>,
) -> TokenStream {
    let (is_async, body) = match attr {
        None => (
            false,
            quote! { turbo_tasks::Vc::cell(turbo_rcstr::RcStr::from(self.to_string())) },
        ),
        Some(AttrForm::FormatAutoFields(fmt)) => struct_format_auto_fields_body(&fmt),
        Some(AttrForm::FormatExprs(fmt, exprs)) => struct_format_exprs_body(&fmt, &exprs),
        Some(AttrForm::DirectExpr(expr)) => (
            true,
            quote! {
                let __val = turbo_tasks::display::ValueToStringify::to_stringify(&(#expr)).await?;
                Ok(turbo_tasks::Vc::cell(turbo_rcstr::RcStr::from(__val)))
            },
        ),
    };
    wrap_impl(ident, is_async, body)
}

fn struct_format_auto_fields_body(fmt: &str) -> (bool, TokenStream2) {
    let (transformed_fmt, field_refs) = parse_format_fields(fmt);

    if field_refs.is_empty() {
        // No fields to resolve — unescape `{{`/`}}` at compile time and use rcstr!
        let unescaped = transformed_fmt.replace("{{", "{").replace("}}", "}");
        return (
            false,
            quote! { turbo_tasks::Vc::cell(turbo_rcstr::rcstr!(#unescaped)) },
        );
    }

    let resolves: Vec<TokenStream2> = field_refs
        .iter()
        .map(|f| {
            let access = f.struct_access();
            generate_resolve(&f.var, &access, true)
        })
        .collect();

    (
        true,
        quote! {
            #(#resolves)*
            Ok(turbo_tasks::Vc::cell(turbo_rcstr::RcStr::from(format!(#transformed_fmt))))
        },
    )
}

fn struct_format_exprs_body(fmt: &str, exprs: &[Expr]) -> (bool, TokenStream2) {
    let (resolve_stmts, vars): (Vec<TokenStream2>, Vec<syn::Ident>) = exprs
        .iter()
        .enumerate()
        .map(|(i, expr)| {
            let var = format_ident!("__arg{}", i);
            let stmt =
                quote! { let #var = turbo_tasks::display::ValueToStringify::to_stringify(&(#expr)).await?; };
            (stmt, var)
        })
        .unzip();

    (
        true,
        quote! {
            #(#resolve_stmts)*
            Ok(turbo_tasks::Vc::cell(turbo_rcstr::RcStr::from(format!(#fmt, #(#vars),*))))
        },
    )
}

fn generate_enum_impl(
    ident: &syn::Ident,
    variants: &Punctuated<Variant, syn::Token![,]>,
) -> TokenStream {
    let mut match_arms = Vec::new();
    let mut needs_async = false;

    for variant in variants {
        let variant_ident = &variant.ident;
        let attr = find_attr(&variant.attrs);

        match attr {
            Some(AttrForm::FormatExprs(fmt, exprs)) => {
                needs_async = true;
                match_arms.push(generate_enum_format_exprs(
                    ident,
                    variant_ident,
                    &variant.fields,
                    &fmt,
                    &exprs,
                ));
            }
            Some(AttrForm::DirectExpr(expr)) => {
                needs_async = true;
                match_arms.push(generate_enum_direct_expr(
                    ident,
                    variant_ident,
                    &variant.fields,
                    &expr,
                ));
            }
            Some(AttrForm::FormatAutoFields(fmt)) => {
                match_arms.push(generate_enum_format_auto_fields(
                    ident,
                    variant_ident,
                    &variant.fields,
                    &fmt,
                    &mut needs_async,
                ));
            }
            None => {
                let name = variant_ident.to_string();
                match_arms.push(generate_enum_format_auto_fields(
                    ident,
                    variant_ident,
                    &variant.fields,
                    &name,
                    &mut needs_async,
                ));
            }
        }
    }

    let result_expr = if needs_async {
        quote! { Ok(turbo_tasks::Vc::cell(s.into())) }
    } else {
        quote! { turbo_tasks::Vc::cell(s.into()) }
    };

    wrap_impl(
        ident,
        needs_async,
        quote! {
            let s = match self {
                #(#match_arms)*
            };
            #result_expr
        },
    )
}

fn generate_enum_format_auto_fields(
    ident: &syn::Ident,
    variant_ident: &syn::Ident,
    fields: &Fields,
    fmt: &str,
    needs_async: &mut bool,
) -> TokenStream2 {
    let (transformed_fmt, field_refs) = parse_format_fields(fmt);

    if !field_refs.is_empty() {
        *needs_async = true;
    }

    let value_expr = if field_refs.is_empty() {
        let unescaped = transformed_fmt.replace("{{", "{").replace("}}", "}");
        quote! { turbo_rcstr::rcstr!(#unescaped) }
    } else {
        quote! { turbo_rcstr::RcStr::from(format!(#transformed_fmt)) }
    };

    match fields {
        Fields::Named(named) => {
            let field_patterns: Vec<TokenStream2> = named
                .named
                .iter()
                .map(|f| {
                    let name = f.ident.as_ref().unwrap();
                    if field_refs.iter().any(|r| *name == r.name) {
                        quote! { #name }
                    } else {
                        quote! { #name: _ }
                    }
                })
                .collect();
            let resolves: Vec<TokenStream2> = field_refs
                .iter()
                .map(|field| {
                    let field_ident = format_ident!("{}", field.name);
                    generate_resolve(&field.var, &quote! { #field_ident }, false)
                })
                .collect();
            quote! {
                #ident::#variant_ident { #(#field_patterns),* } => {
                    #(#resolves)*
                    #value_expr
                }
            }
        }
        Fields::Unnamed(unnamed) => {
            let field_patterns: Vec<TokenStream2> = (0..unnamed.unnamed.len())
                .map(|i| {
                    let idx_str = i.to_string();
                    if field_refs.iter().any(|r| r.name == idx_str) {
                        let var = format_ident!("_{}", i);
                        quote! { #var }
                    } else {
                        quote! { _ }
                    }
                })
                .collect();
            let resolves: Vec<TokenStream2> = field_refs
                .iter()
                .map(|field| {
                    let var = &field.var;
                    generate_resolve(var, &quote! { #var }, false)
                })
                .collect();
            quote! {
                #ident::#variant_ident(#(#field_patterns),*) => {
                    #(#resolves)*
                    #value_expr
                }
            }
        }
        Fields::Unit => {
            quote! { #ident::#variant_ident => { #value_expr } }
        }
    }
}

fn generate_enum_format_exprs(
    ident: &syn::Ident,
    variant_ident: &syn::Ident,
    fields: &Fields,
    fmt: &str,
    exprs: &[Expr],
) -> TokenStream2 {
    let pattern = enum_destructure_all(ident, variant_ident, fields);
    let (resolve_stmts, vars): (Vec<TokenStream2>, Vec<syn::Ident>) = exprs
        .iter()
        .enumerate()
        .map(|(i, expr)| {
            let var = format_ident!("__arg{}", i);
            let stmt =
                quote! { let #var = turbo_tasks::display::ValueToStringify::to_stringify(#expr).await?; };
            (stmt, var)
        })
        .unzip();
    quote! {
        #pattern => {
            #(#resolve_stmts)*
            turbo_rcstr::RcStr::from(format!(#fmt, #(#vars),*))
        }
    }
}

fn generate_enum_direct_expr(
    ident: &syn::Ident,
    variant_ident: &syn::Ident,
    fields: &Fields,
    expr: &Expr,
) -> TokenStream2 {
    let pattern = enum_destructure_all(ident, variant_ident, fields);
    quote! {
        #pattern => {
            turbo_rcstr::RcStr::from(turbo_tasks::display::ValueToStringify::to_stringify(#expr).await?)
        }
    }
}

fn enum_destructure_all(
    ident: &syn::Ident,
    variant_ident: &syn::Ident,
    fields: &Fields,
) -> TokenStream2 {
    match fields {
        Fields::Named(named) => {
            let bindings: Vec<TokenStream2> = named
                .named
                .iter()
                .map(|f| {
                    let name = f.ident.as_ref().unwrap();
                    quote! { #name }
                })
                .collect();
            quote! { #ident::#variant_ident { #(#bindings),* } }
        }
        Fields::Unnamed(unnamed) => {
            let bindings: Vec<TokenStream2> = (0..unnamed.unnamed.len())
                .map(|i| {
                    let var = format_ident!("_{}", i);
                    quote! { #var }
                })
                .collect();
            quote! { #ident::#variant_ident(#(#bindings),*) }
        }
        Fields::Unit => quote! { #ident::#variant_ident },
    }
}
