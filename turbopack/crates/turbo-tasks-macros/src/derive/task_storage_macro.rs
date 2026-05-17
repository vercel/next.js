use proc_macro2::TokenStream;
use quote::quote;
use syn::{
    Fields, Ident, ItemStruct, Meta, Token, Type, Visibility, punctuated::Punctuated,
    spanned::Spanned,
};

/// Derives the TaskStorageInner trait and generates optimized storage structures.
pub fn task_storage(input: proc_macro::TokenStream) -> proc_macro::TokenStream {
    task_storage_impl(input.into()).into()
}

fn task_storage_impl(input: TokenStream) -> TokenStream {
    let input: ItemStruct = match syn::parse2(input) {
        Ok(input) => input,
        Err(e) => return e.to_compile_error(),
    };

    // Parse field annotations
    let storage_fields = match &input.fields {
        Fields::Named(fields) => fields
            .named
            .iter()
            .map(parse_field_storage_attributes)
            .collect::<Vec<_>>(),
        _ => {
            return syn::Error::new(
                input.ident.span(),
                "#[task_storage] can only be applied to structs with named fields",
            )
            .to_compile_error();
        }
    };

    // Create grouped fields container
    let grouped_fields = GroupedFields::new(storage_fields);

    // Generate the implementation (input struct is consumed - not emitted)
    generate_task_storage_impl(&input.ident, &grouped_fields)
}

/// Parsed field information with cached derived values.
///
/// This struct holds all information about a field extracted from its attributes,
/// along with pre-computed values like the PascalCase variant name.
#[derive(Debug, Clone)]
struct FieldInfo {
    is_pub: bool,
    /// The field's identifier (snake_case)
    field_name: Ident,
    /// The PascalCase variant name for use in LazyField enum
    variant_name: Ident,
    field_type: Type,
    storage_type: StorageType,
    category: Category,
    /// If true, field is lazily allocated in Vec<LazyField> (the default).
    /// If false (marked with `inline`), field is stored directly on TaskStorageInner.
    lazy: bool,
    /// If true, filter out values that reference transient tasks during encoding.
    /// For direct fields: skip encoding if value.is_transient() returns true.
    /// For collections: filter out entries where key/value is_transient() returns true.
    filter_transient: bool,
    /// If true, use Default::default() semantics instead of Option for inline direct fields.
    /// The field type should be T (not Option<T>), and empty is represented by T::default().
    use_default: bool,
    /// If true, shrink this collection after task execution completes.
    /// Empty collections are removed entirely from the lazy vec.
    shrink_on_completion: bool,
    /// If true, drop this field entirely after execution completes if the task is immutable.
    /// Immutable tasks don't re-execute, so dependency tracking fields are not needed.
    drop_on_completion_if_immutable: bool,
    /// If true, the macro dispatches to `FieldType::drop_partial(&mut v) -> bool`
    /// in the generated `TaskStorageInner::drop_partial` lazy retain_mut arm instead
    /// of the default wholesale reset. The method's `bool` return signals whether
    /// residue remains (`true` keeps the variant). On restore, the incoming
    /// persistent entries are merged into the residue via `extend`, so the field
    /// type must support `extend(IntoIterator<Item = ...>)` through the usual
    /// newtype `DerefMut`. See `CellData::drop_partial` for the canonical example.
    ///
    /// Cannot be combined with `filter_transient` (both produce residue) or
    /// `inline` (the current consumer is a lazy field; keep the surface small).
    custom_drop_partial: bool,
    /// Optional override for the underlying map type, used when the field is a
    /// newtype wrapping `AutoMap<K, V>` (or similar) so callers can inject
    /// custom bincode / accessor behavior while the macro still generates map
    /// accessors with the right key/value types.
    ///
    /// The newtype must `Deref`/`DerefMut` to the inner map so the generated
    /// accessors (which call `.iter()`, `.insert()`, etc.) keep working.
    ///
    /// When absent, the macro parses the outer field type directly.
    as_type: Option<Type>,
}

impl FieldInfo {
    /// Whether this field is a boolean flag stored in the TaskFlags bitfield.
    fn is_flag(&self) -> bool {
        self.storage_type == StorageType::Flag
    }

    /// Whether this field is transient (not serialized, in-memory only).
    fn is_transient(&self) -> bool {
        self.category == Category::Transient
    }

    /// Generate the full `self.check_access(...)` call for this field.
    fn check_access_call(&self) -> TokenStream {
        match self.category {
            Category::Data => {
                quote! { self.check_access(crate::backend::SpecificTaskDataCategory::Data); }
            }
            Category::Meta => {
                quote! { self.check_access(crate::backend::SpecificTaskDataCategory::Meta); }
            }
            Category::Transient => quote! {
                let _we_dont_check_access_for_transient_data = ();
            },
        }
    }

    /// Generate the full `self.track_modification(...)` call for this field.
    fn track_modification_call(&self) -> TokenStream {
        let field_name_str = self.field_name.to_string();
        match self.category {
            Category::Data => {
                quote! { self.track_modification(crate::backend::storage::SpecificTaskDataCategory::Data, #field_name_str); }
            }
            Category::Meta => {
                quote! { self.track_modification(crate::backend::storage::SpecificTaskDataCategory::Meta, #field_name_str); }
            }
            Category::Transient => {
                quote! {
                    let _we_dont_track_mutations_for_transient_data = ();
                }
            }
        }
    }

    /// Whether this field is stored inline (not lazy).
    fn is_inline(&self) -> bool {
        !self.lazy
    }

    /// Generate expression for immutable collection access.
    ///
    /// Delegates to TaskStorageInner accessor methods:
    /// - For inline fields: `self.typed().{field_name}()` yields `&T`
    /// - For lazy fields: `self.typed().{field_name}()` yields `Option<&T>`
    ///
    /// Note: This is for collection types (AutoSet, CounterMap, AutoMap), not Direct fields.
    fn collection_ref_expr(&self) -> TokenStream {
        let field_name = &self.field_name;
        // Both inline and lazy have accessor methods generated on TaskStorageInner
        quote! { self.typed().#field_name() }
    }

    /// Generate expression for mutable collection access (allocates for lazy fields).
    ///
    /// Delegates to TaskStorageInner accessor methods:
    /// - For inline fields: `self.typed_mut().{field_name}_mut()` yields `&mut T`
    /// - For lazy fields: `self.typed_mut().{field_name}_mut()` yields `&mut T` (allocates if
    ///   needed)
    ///
    /// Note: This is for collection types (AutoSet, CounterMap, AutoMap), not Direct fields.
    fn collection_mut_expr(&self) -> TokenStream {
        let field_name_mut = self.mut_ident();
        // Both inline and lazy have accessor methods generated on TaskStorageInner
        quote! { self.typed_mut().#field_name_mut() }
    }

    /// Whether immutable access returns `Option<&T>` (lazy) vs `&T` (inline).
    ///
    /// This affects how read operations need to handle the result:
    /// - For inline: `collection_ref_expr().get(key)` returns `Option<&V>`
    /// - For lazy: `collection_ref_expr().and_then(|m| m.get(key))` returns `Option<&V>`
    fn is_option_ref(&self) -> bool {
        self.lazy
    }

    // =========================================================================
    // Direct Field Access Helpers
    // =========================================================================

    /// Generate expression to get a Direct field value (returns `Option<&T>`).
    ///
    /// Delegates to TaskStorageInner accessor method `get_{field}()`.
    fn direct_get_expr(&self) -> TokenStream {
        let get_name = self.get_ident();
        quote! { self.typed().#get_name() }
    }

    /// Generate expression to set a Direct field value.
    ///
    /// Delegates to TaskStorageInner accessor method `set_{field}(value)`.
    /// For inline: returns `Option<T>` (old value)
    /// For lazy: returns `()` (no return value from current impl)
    fn direct_set_expr(&self) -> TokenStream {
        let set_name = self.set_ident();
        quote! { self.typed_mut().#set_name }
    }

    /// Generate expression to take a Direct field value.
    ///
    /// Delegates to TaskStorageInner accessor method `take_{field}()`.
    fn direct_take_expr(&self) -> TokenStream {
        let take_name = self.take_ident();
        quote! { self.typed_mut().#take_name() }
    }

    /// Generate expression to get a mutable reference to a Direct field value.
    ///
    /// Delegates to TaskStorageInner accessor method `get_{field}_mut()`.
    /// Only available for lazy Direct fields (inline fields can use set/take).
    fn direct_get_mut_expr(&self) -> TokenStream {
        let get_mut_name = self.get_mut_ident();
        quote! { self.typed_mut().#get_mut_name() }
    }

    // =========================================================================
    // Method Name Helpers
    // Centralized identifier construction for generated method names.
    // =========================================================================

    /// Create an identifier with a prefix: `{prefix}_{field_name}`
    fn prefixed_ident(&self, prefix: &str) -> syn::Ident {
        syn::Ident::new(
            &format!("{}_{}", prefix, self.field_name),
            proc_macro2::Span::call_site(),
        )
    }

    /// Create an identifier with a suffix: `{field_name}_{suffix}`
    fn suffixed_ident(&self, suffix: &str) -> syn::Ident {
        syn::Ident::new(
            &format!("{}_{}", self.field_name, suffix),
            proc_macro2::Span::call_site(),
        )
    }

    /// Create an identifier with infix: `{prefix}_{field_name}_{suffix}`
    fn infixed_ident(&self, prefix: &str, suffix: &str) -> syn::Ident {
        syn::Ident::new(
            &format!("{}_{}_{}", prefix, self.field_name, suffix),
            proc_macro2::Span::call_site(),
        )
    }

    /// Create identifier matching field name (for immutable collection accessors)
    fn ref_ident(&self) -> syn::Ident {
        self.field_name.clone()
    }

    // Convenience methods for common accessor patterns
    fn get_ident(&self) -> syn::Ident {
        self.prefixed_ident("get")
    }
    fn set_ident(&self) -> syn::Ident {
        self.prefixed_ident("set")
    }
    fn take_ident(&self) -> syn::Ident {
        self.prefixed_ident("take")
    }
    fn has_ident(&self) -> syn::Ident {
        self.prefixed_ident("has")
    }
    fn get_mut_ident(&self) -> syn::Ident {
        self.infixed_ident("get", "mut")
    }
    fn mut_ident(&self) -> syn::Ident {
        self.suffixed_ident("mut")
    }
    fn iter_ident(&self) -> syn::Ident {
        self.prefixed_ident("iter")
    }
    fn len_ident(&self) -> syn::Ident {
        self.suffixed_ident("len")
    }
    fn is_empty_ident(&self) -> syn::Ident {
        syn::Ident::new(
            &format!("is_{}_empty", self.field_name),
            proc_macro2::Span::call_site(),
        )
    }

    /// Identifier of the schema-emitted `LAZY_TAG_<FIELD_NAME>` constant
    /// for this field. Lazy fields are addressed by tag everywhere in
    /// generated code (typed accessors, encode/decode, dispatch tables),
    /// so the construction `LAZY_TAG_<uppercase field name>` shows up
    /// many times — keep it in one place.
    fn tag_ident(&self) -> syn::Ident {
        syn::Ident::new(
            &format!("LAZY_TAG_{}", self.field_name.to_string().to_uppercase()),
            proc_macro2::Span::call_site(),
        )
    }
}

#[derive(Debug, Clone, PartialEq, Eq)]
enum StorageType {
    Direct,
    AutoSet,
    AutoMap,
    CounterMap,
    Flag,
}

#[derive(Debug, Clone, PartialEq, Eq)]
enum Category {
    Data,
    Meta,
    Transient,
}

/// Try to extract a string literal from an expression, emitting an error if it's not a string.
fn expect_string_literal<'a>(expr: &'a syn::Expr, attr_name: &str) -> Option<&'a syn::LitStr> {
    if let syn::Expr::Lit(syn::ExprLit {
        lit: syn::Lit::Str(lit_str),
        ..
    }) = expr
    {
        Some(lit_str)
    } else {
        expr.span()
            .unwrap()
            .error(format!("`{attr_name}` value must be a string literal"))
            .emit();
        None
    }
}

fn parse_field_storage_attributes(field: &syn::Field) -> FieldInfo {
    let field_name = field.ident.as_ref().unwrap().clone();
    let field_type = field.ty.clone();
    let is_pub = matches!(field.vis, Visibility::Public(_));

    // Pre-compute the PascalCase variant name once
    let variant_name = syn::Ident::new(&to_pascal_case(&field_name.to_string()), field_name.span());

    // Default values
    let mut storage_type: Option<StorageType> = None;
    let mut category: Option<Category> = None;
    let mut inline = false; // Default is lazy (not inline)
    let mut filter_transient = false;
    let mut use_default = false;
    let mut shrink_on_completion = false;
    let mut drop_on_completion_if_immutable = false;
    let mut custom_drop_partial = false;
    let mut as_type: Option<Type> = None;

    // Find and parse the field attribute
    if let Some(attr) = field.attrs.iter().find(|attr| {
        attr.path()
            .get_ident()
            .map(|ident| *ident == "field")
            .unwrap_or_default()
    }) {
        let nested = match attr.parse_args_with(Punctuated::<Meta, Token![,]>::parse_terminated) {
            Ok(punctuated) => punctuated,
            Err(e) => {
                attr.meta
                    .span()
                    .unwrap()
                    .error(format!("failed to parse field attribute: {e}"))
                    .emit();
                Punctuated::new()
            }
        };

        for meta in nested {
            match &meta {
                Meta::NameValue(nv) => {
                    let Some(ident) = nv.path.get_ident() else {
                        nv.path
                            .span()
                            .unwrap()
                            .error("expected simple identifier")
                            .emit();
                        continue;
                    };

                    match ident.to_string().as_str() {
                        "storage" => {
                            if let Some(lit_str) = expect_string_literal(&nv.value, "storage") {
                                storage_type = Some(match lit_str.value().as_str() {
                                    "direct" => StorageType::Direct,
                                    "auto_set" => StorageType::AutoSet,
                                    "auto_map" => StorageType::AutoMap,
                                    "counter_map" => StorageType::CounterMap,
                                    "flag" => StorageType::Flag,
                                    other => {
                                        meta.span()
                                            .unwrap()
                                            .error(format!(
                                                "unknown storage type: `{other}`. Expected \
                                                 `direct`, `auto_set`, `auto_map`, \
                                                 `auto_multimap`, `counter_map`, or `flag`"
                                            ))
                                            .emit();
                                        continue;
                                    }
                                });
                            }
                        }
                        "category" => {
                            if let Some(lit_str) = expect_string_literal(&nv.value, "category") {
                                category = Some(match lit_str.value().as_str() {
                                    "data" => Category::Data,
                                    "meta" => Category::Meta,
                                    "transient" => Category::Transient,
                                    other => {
                                        meta.span()
                                            .unwrap()
                                            .error(format!(
                                                "unknown category: `{other}`. Expected `data`, \
                                                 `meta`, or `transient`"
                                            ))
                                            .emit();
                                        continue;
                                    }
                                });
                            }
                        }
                        "as_type" => {
                            if let Some(lit_str) = expect_string_literal(&nv.value, "as_type") {
                                match syn::parse_str::<Type>(&lit_str.value()) {
                                    Ok(ty) => as_type = Some(ty),
                                    Err(err) => {
                                        lit_str
                                            .span()
                                            .unwrap()
                                            .error(format!(
                                                "`as_type` must parse as a Rust type: {err}"
                                            ))
                                            .emit();
                                    }
                                }
                            }
                        }
                        other => {
                            meta.span()
                                .unwrap()
                                .error(format!(
                                    "unknown attribute `{other}`, expected `storage`, `category`, \
                                     or `as_type`"
                                ))
                                .emit();
                        }
                    };
                }
                Meta::Path(path) => {
                    let Some(ident) = path.get_ident() else {
                        path.span()
                            .unwrap()
                            .error("expected simple identifier")
                            .emit();
                        continue;
                    };

                    if ident == "inline" {
                        inline = true;
                    } else if ident == "filter_transient" {
                        filter_transient = true;
                    } else if ident == "default" {
                        use_default = true;
                    } else if ident == "shrink_on_completion" {
                        shrink_on_completion = true;
                    } else if ident == "drop_on_completion_if_immutable" {
                        drop_on_completion_if_immutable = true;
                    } else if ident == "custom_drop_partial" {
                        custom_drop_partial = true;
                    } else {
                        meta.span()
                            .unwrap()
                            .error(format!(
                                "unknown modifier `{ident}`, expected `inline`, \
                                 `filter_transient`, `default`, `shrink_on_completion`, \
                                 `drop_on_completion_if_immutable`, or `custom_drop_partial`"
                            ))
                            .emit();
                    }
                }
                Meta::List(list) => {
                    meta.span()
                        .unwrap()
                        .error(format!(
                            "unexpected nested list `{}(...)`, expected key-value or modifier",
                            list.path
                                .get_ident()
                                .map(|i| i.to_string())
                                .unwrap_or_default()
                        ))
                        .emit();
                }
            }
        }
    } else {
        field_name
            .span()
            .unwrap()
            .error(format!(
                "field `{field_name}` is missing required #[field(...)] attribute. Expected \
                 #[field(storage = \"...\", category = \"...\")]"
            ))
            .emit();
    }

    // Require explicit storage type
    let storage_type = match storage_type {
        Some(st) => st,
        None => {
            field_name
                .span()
                .unwrap()
                .error(format!(
                    "field `{}` requires explicit storage type. Add #[field(storage = \"...\")]. \
                     Valid types: \"direct\", \"auto_set\", \"auto_map\", \"auto_multimap\", \
                     \"counter_map\", \"flag\"",
                    field_name
                ))
                .emit();
            StorageType::Direct // Default to avoid cascading errors
        }
    };

    // Require explicit category for all fields
    let category = match category {
        Some(cat) => cat,
        None => {
            field_name
                .span()
                .unwrap()
                .error(format!(
                    "field `{}` requires explicit category. Add #[field(category = \"data\")], \
                     #[field(category = \"meta\")], or #[field(category = \"transient\")]",
                    field_name
                ))
                .emit();
            Category::Data // Default to avoid cascading errors
        }
    };

    // Validate that shrink_on_completion and drop_on_completion_if_immutable are only used on
    // collection types (auto_set, auto_map, counter_map) for inline fields.
    // Lazy non-collection fields can still use drop_on_completion_if_immutable (removes from the
    // lazy vec), but shrink_on_completion is meaningless for non-collection types.
    let is_collection = matches!(
        storage_type,
        StorageType::AutoSet | StorageType::AutoMap | StorageType::CounterMap
    );
    if !is_collection {
        if shrink_on_completion {
            field_name
                .span()
                .unwrap()
                .error(format!(
                    "`shrink_on_completion` on field `{field_name}` has no effect: only \
                     collection types (auto_set, auto_map, counter_map) support shrinking"
                ))
                .emit();
        }
        if inline && drop_on_completion_if_immutable {
            field_name
                .span()
                .unwrap()
                .error(format!(
                    "`drop_on_completion_if_immutable` on inline field `{field_name}` has no \
                     effect: only inline collection types (auto_set, auto_map, counter_map) \
                     support dropping"
                ))
                .emit();
        }
    }

    if custom_drop_partial {
        if inline {
            field_name
                .span()
                .unwrap()
                .error(format!(
                    "`custom_drop_partial` on inline field `{field_name}` is not supported; move \
                     the field to lazy storage or extend the macro to handle inline custom drops"
                ))
                .emit();
        }
        if filter_transient {
            field_name
                .span()
                .unwrap()
                .error(format!(
                    "`custom_drop_partial` cannot be combined with `filter_transient` on \
                     `{field_name}`: both paths produce residue and the semantics would conflict"
                ))
                .emit();
        }
        if !is_collection {
            field_name
                .span()
                .unwrap()
                .error(format!(
                    "`custom_drop_partial` on field `{field_name}` requires a collection storage \
                     type (auto_set, auto_map, counter_map)"
                ))
                .emit();
        }
    }

    FieldInfo {
        is_pub,
        field_name,
        variant_name,
        field_type,
        storage_type,
        category,
        lazy: !inline, // Default is lazy; inline = true means lazy = false
        filter_transient,
        use_default,
        shrink_on_completion,
        drop_on_completion_if_immutable,
        custom_drop_partial,
        as_type,
    }
}

/// All parsed fields stored in a single vec, with filter methods for different access patterns.
#[derive(Debug)]
struct GroupedFields {
    fields: Vec<FieldInfo>,
}

impl GroupedFields {
    fn new(fields: Vec<FieldInfo>) -> Self {
        Self { fields }
    }

    // =========================================================================
    // Flag field iterators
    // =========================================================================

    /// Returns an iterator over transient flag fields.
    fn transient_flags(&self) -> impl Iterator<Item = &FieldInfo> {
        self.fields
            .iter()
            .filter(|f| f.is_flag() && f.is_transient())
    }

    /// Returns true if there are any flag fields.
    fn has_flags(&self) -> bool {
        self.fields.iter().any(|f| f.is_flag())
    }

    /// Returns an iterator over persisted meta category flag fields.
    fn persisted_meta_flags(&self) -> impl Iterator<Item = &FieldInfo> {
        self.fields
            .iter()
            .filter(|f| f.is_flag() && !f.is_transient() && f.category == Category::Meta)
    }

    /// Returns an iterator over persisted data category flag fields.
    fn persisted_data_flags(&self) -> impl Iterator<Item = &FieldInfo> {
        self.fields
            .iter()
            .filter(|f| f.is_flag() && !f.is_transient() && f.category == Category::Data)
    }

    /// Returns the count of persisted meta flag fields.
    fn persisted_meta_flags_count(&self) -> usize {
        self.persisted_meta_flags().count()
    }

    /// Returns the count of persisted data flag fields.
    fn persisted_data_flags_count(&self) -> usize {
        self.persisted_data_flags().count()
    }

    // =========================================================================
    // Non-flag field iterators
    // =========================================================================

    /// Returns an iterator over all non-flag fields.
    fn all_fields(&self) -> impl Iterator<Item = &FieldInfo> {
        self.fields.iter().filter(|f| !f.is_flag())
    }

    /// Returns an iterator over all lazy fields (both data and meta categories).
    ///
    /// The order is **sorted by category** — transient variants first, then
    /// meta, then data — with schema declaration order preserved within each
    /// category. This grouping is load-bearing for codegen: contiguous
    /// categories in the generated `LazyField` enum let LLVM lower
    /// `is_persistent()` / `is_meta()` to a single integer range check on the
    /// discriminant tag instead of a per-variant jump table.
    ///
    /// Every downstream generator (enum declaration, `index_and_persistence`,
    /// restore merge arms, `build_lazy_index`) iterates `all_lazy()` and uses
    /// `enumerate()` positions as the variant index, so they all pick up the
    /// same sorted order consistently. `persistent_lazy(category)` does not
    /// need to match this order because its consumers (bincode encode/decode,
    /// clone arms) use per-category enumeration and Rust match arms are
    /// order-independent.
    fn all_lazy(&self) -> impl Iterator<Item = &FieldInfo> {
        let mut lazy: Vec<&FieldInfo> = self
            .fields
            .iter()
            .filter(|f| !f.is_flag() && f.lazy)
            .collect();
        // Stable sort by category rank; within a category, preserve schema
        // declaration order.
        //
        // Tag = position in this iteration order + 1, and the byte tail packs
        // payloads in ascending tag order — so the *first* category sits at
        // the head of the tail and the *last* category sits at the end.
        // Inserts and removes only shift bytes that pack AFTER the target
        // tag, so we want the most-churned category (transient: installed
        // during a task run, dropped at completion) to land at the END.
        // Meta first (restored once on first access, mostly stable), then
        // Data (bulk, mostly written-once during execution), then Transient.
        lazy.sort_by_key(|f| match f.category {
            Category::Meta => 0u8,
            Category::Data => 1,
            Category::Transient => 2,
        });
        lazy.into_iter()
    }

    /// Returns true if there are any lazy fields.
    fn has_lazy(&self) -> bool {
        self.fields.iter().any(|f| !f.is_flag() && f.lazy)
    }

    /// Returns an iterator over all inline (non-lazy, non-flag) fields.
    fn all_inline(&self) -> impl Iterator<Item = &FieldInfo> {
        self.fields.iter().filter(|f| !f.is_flag() && !f.lazy)
    }

    // =========================================================================
    // Category-specific iterators for serialization
    // =========================================================================

    /// Returns an iterator over persistent (non-transient) inline fields for a category.
    fn persistent_inline(&self, category: Category) -> impl Iterator<Item = &FieldInfo> {
        self.fields
            .iter()
            .filter(move |f| !f.is_flag() && !f.lazy && !f.is_transient() && f.category == category)
    }

    /// Returns an iterator over persistent (non-transient) lazy fields for a category.
    fn persistent_lazy(&self, category: Category) -> impl Iterator<Item = &FieldInfo> {
        self.fields
            .iter()
            .filter(move |f| !f.is_flag() && f.lazy && !f.is_transient() && f.category == category)
    }
}

// =============================================================================
// Code Generation Helpers
// =============================================================================

/// Generate inline field clone assignments: `snapshot.inline.field = self.inline.field.clone();`
///
/// Inline fields live on the schema-emitted `TaskStorageInline`; this helper
/// only ever handles inline (non-lazy) fields.
fn gen_clone_inline_fields<'a>(fields: impl Iterator<Item = &'a FieldInfo>) -> Vec<TokenStream> {
    fields
        .map(|field| {
            let field_name = &field.field_name;
            quote! {
                snapshot.inline.#field_name = self.inline.#field_name.clone();
            }
        })
        .collect()
}

fn gen_restore_inline_field(field: &FieldInfo) -> TokenStream {
    let field_name = &field.field_name;
    // `TaskStorageInner` implements `Drop`, so we cannot partially move out of
    // `source.head` here. Use `std::mem::take` instead — `source` is
    // consumed by the surrounding `restore_*_from` and its remaining fields
    // will be properly dropped by Rust's struct destructor.
    if !field.filter_transient {
        return quote! {
            self.inline.#field_name = std::mem::take(&mut source.inline.#field_name);
        };
    }
    match field.storage_type {
        StorageType::Direct => {
            // Inline `Option<T>` with `T: is_transient()`. Residue in `self`
            // means a transient value is live and newer than the disk value —
            // prefer the residue; otherwise take the source.
            quote! {
                if self.inline.#field_name.is_none() {
                    self.inline.#field_name = std::mem::take(&mut source.inline.#field_name);
                }
            }
        }
        StorageType::AutoSet => {
            quote! {
                if self.inline.#field_name.is_empty() {
                    self.inline.#field_name = std::mem::take(&mut source.inline.#field_name);
                } else {
                    self.inline.#field_name.merge_restore(std::mem::take(&mut source.inline.#field_name));
                }
            }
        }
        StorageType::CounterMap | StorageType::AutoMap => {
            // CounterMap / AutoMap: transient residue (if any) is keyed by
            // transient task ids; source entries are keyed by persistent ids.
            // These key spaces are disjoint, so `extend` merges cleanly.
            quote! {
                if self.inline.#field_name.is_empty() {
                    self.inline.#field_name = std::mem::take(&mut source.inline.#field_name);
                } else {
                    self.inline.#field_name.merge_restore(std::mem::take(&mut source.inline.#field_name));
                }
            }
        }
        StorageType::Flag => unreachable!(),
    }
}

fn generate_task_storage_impl(_ident: &Ident, grouped_fields: &GroupedFields) -> TokenStream {
    // Generate TaskFlags bitfield if there are flag fields
    let task_flags_bitfield = generate_task_flags_bitfield(grouped_fields);

    // Generate LazyField enum for lazy fields
    let lazy_field_enum = generate_lazy_field_enum(grouped_fields);

    // Generate the unified TaskStorageInner struct
    let typed_storage_struct = generate_typed_storage_struct(grouped_fields);

    // Generate accessor methods
    let accessor_methods = generate_accessor_methods(grouped_fields);

    // Generate TaskStorageAccessors trait for all fields
    let accessors_trait = generate_task_storage_accessors_trait(grouped_fields);

    // Generate encode/decode methods for serialization
    let encode_decode_methods = generate_encode_decode_methods(grouped_fields);

    // Generate snapshot clone and restore methods
    let snapshot_restore_methods = generate_snapshot_restore_methods(grouped_fields);

    // Generate eviction methods
    let eviction_methods = generate_drop_method(grouped_fields);

    quote! {
        // Import ShrinkToFit trait for the derive macro generated code
        use turbo_tasks::ShrinkToFit as _;

        // Generated TaskFlags bitfield
        #task_flags_bitfield

        // Generated LazyField enum
        #lazy_field_enum

        // Generated TaskStorageInner struct (unified)
        #typed_storage_struct

        // Generated accessor methods
        #accessor_methods

        // Generated encode/decode methods
        #encode_decode_methods

        // Generated snapshot clone and restore methods
        #snapshot_restore_methods

        // Generated eviction methods
        #eviction_methods

        // Generated TaskStorageAccessors trait
        #accessors_trait
    }
}

/// Generate the TaskFlags bitfield using the bitfield crate.
///
/// Flags are ordered as: persisted meta, persisted data, transient.
/// This allows separate masks for meta and data category serialization.
///
/// Bit layout: [meta flags: 0..M] [data flags: M..M+D] [transient: M+D..]
fn generate_task_flags_bitfield(grouped_fields: &GroupedFields) -> TokenStream {
    let all_flags: Vec<_> = grouped_fields
        .persisted_meta_flags()
        .chain(grouped_fields.persisted_data_flags())
        .chain(grouped_fields.transient_flags())
        .collect();

    // If no flags, don't generate the bitfield
    if all_flags.is_empty() {
        return quote! {};
    }

    let meta_count = grouped_fields.persisted_meta_flags_count();
    let data_count = grouped_fields.persisted_data_flags_count();
    let persisted_count = meta_count + data_count;

    // Ensure counts fit within u16 bitfield (and u8 for individual categories)
    assert!(
        meta_count <= 8,
        "Too many persisted meta flags ({meta_count}), maximum is 8 (though this could be \
         expanded)"
    );
    assert!(
        data_count <= 8,
        "Too many persisted data flags ({data_count}), maximum is 8 (though this could be \
         expanded)"
    );
    assert!(
        all_flags.len() <= 16,
        "Too many total flags ({}), maximum is 16 (though this could be expanded)",
        all_flags.len()
    );

    // Generate bitfield accessors
    // Format: pub field_name, set_field_name: bit_index;
    let bitfield_accessors: Vec<_> = all_flags
        .iter()
        .enumerate()
        .map(|(i, field)| {
            let field_name = &field.field_name;
            let set_name = field.set_ident();
            // bitfield crate uses usize for bit indices, but literal integers work fine
            let bit_idx = i;
            quote! {
                pub #field_name, #set_name: #bit_idx
            }
        })
        .collect();

    // Generate masks for each category
    // Meta flags are in bits 0..meta_count
    // Data flags are in bits meta_count..meta_count+data_count
    // Combined persisted mask covers both
    let meta_mask = if meta_count > 0 {
        (1u16 << meta_count) - 1
    } else {
        0
    };
    let data_mask = if data_count > 0 {
        ((1u16 << data_count) - 1) << meta_count
    } else {
        0
    };
    let persisted_mask = if persisted_count > 0 {
        (1u16 << persisted_count) - 1
    } else {
        0
    };

    quote! {
        bitfield::bitfield! {
            #[doc = "Combined bitfield for task flags."]
            #[doc = ""]
            #[doc = "Bit layout: [meta flags: 0..M] [data flags: M..M+D] [transient: M+D..]"]
            #[doc = "This ordering allows separate masks for per-category serialization."]
            #[derive(Clone, Default, PartialEq, Eq)]
            pub struct TaskFlags(u16);
            impl Debug;

            #(#bitfield_accessors;)*
        }

        #[automatically_derived]
        impl TaskFlags {
            #[doc = "Mask for persisted meta flags"]
            pub const META_MASK: u16 = #meta_mask;

            #[doc = "Mask for persisted data flags"]
            pub const DATA_MASK: u16 = #data_mask;

            #[doc = "Mask for all persisted flags (meta + data)"]
            pub const PERSISTED_MASK: u16 = #persisted_mask;

            #[doc = "Get the raw bits value"]
            pub fn bits(&self) -> u16 {
                self.0
            }

            #[doc = "Get only the persisted meta bits (for meta serialization)"]
            pub fn persisted_meta_bits(&self) -> u8 {
                // Meta bits are in the lowest positions (bits 0..meta_count),
                // and we assert meta_count <= 8, so this fits in a u8
                (self.0 & Self::META_MASK) as u8
            }

            #[doc = "Get only the persisted data bits (for data serialization)"]
            pub fn persisted_data_bits(&self) -> u8 {
                // Data bits are in positions meta_count..meta_count+data_count,
                // so we shift right to get them into the low bits.
                // We assert data_count <= 8, so this fits in a u8
                ((self.0 & Self::DATA_MASK) >> #meta_count) as u8
            }

            #[doc = "Get all persisted bits (for serialization)"]
            pub fn persisted_bits(&self) -> u16 {
                self.0 & Self::PERSISTED_MASK
            }

            #[doc = "Set meta bits from a raw value, preserving other flags"]
            pub fn set_persisted_meta_bits(&mut self, bits: u8) {
                // Meta bits go in the lowest positions (bits 0..meta_count)
                self.0 = (self.0 & !Self::META_MASK) | (bits as u16 & Self::META_MASK);
            }

            #[doc = "Set data bits from a raw value, preserving other flags"]
            pub fn set_persisted_data_bits(&mut self, bits: u8) {
                // Data bits go in positions meta_count..meta_count+data_count,
                // so we shift left to place them correctly
                self.0 = (self.0 & !Self::DATA_MASK) | (((bits as u16) << #meta_count) & Self::DATA_MASK);
            }

            #[doc = "Set all persisted bits from a raw value, preserving transient flags"]
            pub fn set_persisted_bits(&mut self, bits: u16) {
                self.0 = (self.0 & !Self::PERSISTED_MASK) | (bits & Self::PERSISTED_MASK);
            }

            #[doc = "Clear all persisted meta flag bits, preserving transient flags."]
            #[doc = ""]
            #[doc = "Called by `drop_partial` when evicting the meta category so the"]
            #[doc = "bitfield reflects \"no persisted meta state present\" — required"]
            #[doc = "for `is_empty()` to accept fully-evicted tasks for removal."]
            pub fn clear_persisted_meta_bits(&mut self) {
                self.0 &= !Self::META_MASK;
            }

            #[doc = "Clear all persisted data flag bits, preserving transient flags."]
            #[doc = ""]
            #[doc = "Counterpart of `clear_persisted_meta_bits` for the data category."]
            pub fn clear_persisted_data_bits(&mut self) {
                self.0 &= !Self::DATA_MASK;
            }

            #[doc = "Create from raw bits (for deserialization)"]
            pub fn from_bits(bits: u16) -> Self {
                Self(bits)
            }
        }
    }
}

/// Generate the lazy-field tag tables and per-tag dispatch functions.
///
/// The previous `LazyField` enum is gone — payloads live directly in
/// `LazyTail`'s byte buffer addressed by tag — so this generator emits only
/// the schema-level constants and the unsafe dispatch helpers consumed by
/// `LazyTail`-aware code in `storage_schema.rs`.
fn generate_lazy_field_enum(grouped_fields: &GroupedFields) -> TokenStream {
    let all_lazy_fields: Vec<_> = grouped_fields.all_lazy().collect();

    // Nothing to emit if the schema has no lazy fields.
    if all_lazy_fields.is_empty() {
        return quote! {};
    }

    let num_variants = all_lazy_fields.len();

    // Per-variant tag constants. The macro assigns tag = idx + 1 in the
    // `all_lazy()` order so that tag 0 is reserved as the bincode encode
    // sentinel. Each constant has the shape `LAZY_TAG_<UPPER>: u8`.
    let tag_constants: Vec<_> = all_lazy_fields
        .iter()
        .enumerate()
        .map(|(idx, field)| {
            let tag_ident = field.tag_ident();
            let tag = idx as u8;
            let ty = &field.field_type;
            let doc = format!(
                "Tag for the `{}` lazy variant, carrying the payload type `{}` in the type \
                 system. Used to address its payload in the byte tail. Pass to typed \
                 `TaskStorage::lazy_*` methods which infer the payload type from this constant.",
                field.variant_name,
                quote::quote!(#ty),
            );
            quote! {
                #[doc = #doc]
                pub const #tag_ident: crate::backend::lazy_tail::Tag<#ty> =
                    crate::backend::lazy_tail::Tag::new(#tag);
            }
        })
        .collect();

    // Per-tag payload size (in bytes), indexed by tag (0-based).
    let size_entries: Vec<_> = all_lazy_fields
        .iter()
        .map(|field| {
            let ty = &field.field_type;
            quote! { (std::mem::size_of::<#ty>() as u16) }
        })
        .collect();

    // Per-tag payload alignment (in bytes), indexed by tag (0-based).
    let align_entries: Vec<_> = all_lazy_fields
        .iter()
        .map(|field| {
            let ty = &field.field_type;
            quote! { (std::mem::align_of::<#ty>() as u8) }
        })
        .collect();

    // Per-tag padded payload size. The byte tail places each payload at an
    // offset aligned to `LAZY_MAX_ALIGN` (the buffer's allocation alignment),
    // so we round each payload's size up to `LAZY_MAX_ALIGN`. This wastes a
    // few bytes for variants smaller than the max alignment but guarantees
    // every payload sits at a valid offset for its own alignment regardless
    // of the order variants are pushed in.
    //
    // `LAZY_MAX_ALIGN` is itself a const expression evaluated below; we use
    // it here via the symbol name (the emitted code references it in the
    // same module).
    let padded_size_entries: Vec<_> = all_lazy_fields
        .iter()
        .map(|field| {
            let ty = &field.field_type;
            quote! {
                {
                    let size = std::mem::size_of::<#ty>();
                    let align = LAZY_MAX_ALIGN;
                    ((size + align - 1) & !(align - 1)) as u16
                }
            }
        })
        .collect();

    // Per-category presence-bitmap masks. Bit `tag` is set for variants
    // belonging to the category. `LAZY_PERSISTENT_MASK` is `LAZY_META_MASK |
    // LAZY_DATA_MASK`.
    let mut persistent_mask: u32 = 0;
    let mut meta_mask: u32 = 0;
    let mut data_mask: u32 = 0;
    for (idx, field) in all_lazy_fields.iter().enumerate() {
        let bit = 1u32 << idx;
        match field.category {
            Category::Meta => {
                meta_mask |= bit;
                persistent_mask |= bit;
            }
            Category::Data => {
                data_mask |= bit;
                persistent_mask |= bit;
            }
            Category::Transient => {}
        }
    }

    // Per-tag dispatch arms for `lazy_drop_dispatch`. Each arm casts the byte
    // pointer to the right payload type and calls `drop_in_place`.
    // Match arms read `tag.raw()` for terse pattern syntax (`0u8 => …`).
    let drop_dispatch_arms: Vec<_> = all_lazy_fields
        .iter()
        .enumerate()
        .map(|(idx, field)| {
            let tag = idx as u8;
            let ty = &field.field_type;
            quote! {
                #tag => {
                    // SAFETY: caller guarantees `ptr` points to a live
                    // `#ty` payload (per the schema's tag → type mapping).
                    unsafe { core::ptr::drop_in_place::<#ty>(ptr.cast::<#ty>()); }
                }
            }
        })
        .collect();

    // Per-tag dispatch arms for `lazy_is_empty_dispatch`. Direct payloads are
    // "always non-empty when present"; collection payloads delegate to their
    // own `is_empty()`.
    let is_empty_dispatch_arms: Vec<_> = all_lazy_fields
        .iter()
        .enumerate()
        .map(|(idx, field)| {
            let tag = idx as u8;
            let ty = &field.field_type;
            let body = match field.storage_type {
                StorageType::Direct => quote! { false },
                _ => quote! {
                    // SAFETY: caller guarantees `ptr` points to a live `#ty`.
                    unsafe { (*ptr.cast::<#ty>()).is_empty() }
                },
            };
            quote! { #tag => #body }
        })
        .collect();

    // Per-tag dispatch arms for `lazy_debug_dispatch`. Each arm renders the
    // present payload using its own `Debug` impl. The field name is
    // forwarded as the key in the `DebugMap` the caller passes in.
    let debug_dispatch_arms: Vec<_> = all_lazy_fields
        .iter()
        .enumerate()
        .map(|(idx, field)| {
            let tag = idx as u8;
            let ty = &field.field_type;
            let field_name_str = field.field_name.to_string();
            quote! {
                #tag => {
                    // SAFETY: caller guarantees `ptr` points to a live `#ty`.
                    let value: &#ty = unsafe { &*ptr.cast::<#ty>() };
                    map.entry(&#field_name_str, value);
                }
            }
        })
        .collect();

    quote! {
        // =====================================================================
        // Lazy-field tag layout tables.
        //
        // Each lazy variant in the schema is assigned a 0-based tag. The
        // byte-tail layout (see `LazyTail`) stores payloads packed in tag
        // order. Presence is tracked by a `u32` bitmap; payload positions
        // are computed from `LAZY_PADDED_SIZE[tag]` for each set bit
        // below the target tag.
        //
        // These constants live at the schema's module level so storage
        // primitives in `storage_schema.rs` and per-variant accessors emitted
        // by this macro can both reference them.
        // =====================================================================

        #(#tag_constants)*

        #[doc = "Number of lazy variants. Tags are `0..LAZY_N`."]
        pub const LAZY_N: u8 = #num_variants as u8;

        #[doc = "Compile-time assertion that the bitmap fits in `u32`."]
        const _: () = assert!(
            (LAZY_N as usize) <= 32,
            "lazy_present is u32; schema declares too many lazy variants",
        );

        #[doc = "Per-tag payload size in bytes (0-based index)."]
        pub const LAZY_SIZE: [u16; LAZY_N as usize] = [#(#size_entries),*];

        #[doc = "Per-tag payload alignment in bytes (0-based index)."]
        const LAZY_ALIGN: [u8; LAZY_N as usize] = [#(#align_entries),*];

        #[doc = "Maximum alignment across all lazy payloads. The tail buffer is"]
        #[doc = "allocated with at least this alignment so every payload sits at a"]
        #[doc = "valid offset."]
        pub const LAZY_MAX_ALIGN: usize = {
            let mut i = 0;
            let mut m: u8 = 1;
            while i < LAZY_N as usize {
                if LAZY_ALIGN[i] > m { m = LAZY_ALIGN[i]; }
                i += 1;
            }
            m as usize
        };

        #[doc = "Per-tag padded payload size (size rounded up to align). Used to"]
        #[doc = "compute byte offsets into the tail without re-doing alignment math."]
        pub const LAZY_PADDED_SIZE: [u16; LAZY_N as usize] = [#(#padded_size_entries),*];

        #[doc = "Bitmap of persistent (non-transient) variants. Bit `tag` set."]
        pub const LAZY_PERSISTENT_MASK: u32 = #persistent_mask;

        #[doc = "Bitmap of meta-category variants. Bit `tag` set."]
        pub const LAZY_META_MASK: u32 = #meta_mask;

        #[doc = "Bitmap of data-category variants. Bit `tag` set."]
        pub const LAZY_DATA_MASK: u32 = #data_mask;

        #[doc = "Drop the payload at `ptr` interpreted as the type whose tag is `tag`."]
        #[doc = ""]
        #[doc = "# Safety"]
        #[doc = ""]
        #[doc = "`ptr` must point to a live payload whose runtime type matches the"]
        #[doc = "compile-time payload type assigned to `tag` in the schema. After this"]
        #[doc = "call the bytes at `ptr` are uninitialized."]
        pub(crate) unsafe fn lazy_drop_dispatch(
            tag: crate::backend::lazy_tail::Tag,
            ptr: *mut std::mem::MaybeUninit<u8>,
        ) {
            match tag.raw() {
                #(#drop_dispatch_arms)*
                _ => debug_assert!(false, "lazy_drop_dispatch: invalid tag {}", tag.raw()),
            }
        }

        #[doc = "Return `true` if the payload at `ptr` is empty in the collection sense."]
        #[doc = ""]
        #[doc = "Direct payloads are considered \"not empty\" — their presence in the"]
        #[doc = "lazy area carries meaningful state."]
        #[doc = ""]
        #[doc = "# Safety"]
        #[doc = "Same as `lazy_drop_dispatch`."]
        pub(crate) unsafe fn lazy_is_empty_dispatch(
            tag: crate::backend::lazy_tail::Tag,
            ptr: *const std::mem::MaybeUninit<u8>,
        ) -> bool {
            match tag.raw() {
                #(#is_empty_dispatch_arms,)*
                _ => {
                    debug_assert!(false, "lazy_is_empty_dispatch: invalid tag {}", tag.raw());
                    false
                }
            }
        }

        #[doc = "Format the payload at `ptr` into `map` keyed by the variant's"]
        #[doc = "field name. Used by `TaskStorage`'s `Debug` impl to render"]
        #[doc = "each present lazy variant by its real name and value."]
        #[doc = ""]
        #[doc = "# Safety"]
        #[doc = "Same as `lazy_drop_dispatch`."]
        pub(crate) unsafe fn lazy_debug_dispatch(
            tag: crate::backend::lazy_tail::Tag,
            ptr: *const std::mem::MaybeUninit<u8>,
            map: &mut std::fmt::DebugMap<'_, '_>,
        ) {
            match tag.raw() {
                #(#debug_dispatch_arms)*
                _ => debug_assert!(false, "lazy_debug_dispatch: invalid tag {}", tag.raw()),
            }
        }
    }
}

/// Generate the unified TaskStorageInner struct, plus a private `TaskStorageInline`
/// that groups the schema-declared inline fields. Splitting inline fields out
/// is preparation for moving the lazy-tail byte buffer into the same heap
/// allocation as the head (step 3 of the storage refactor): once the byte
/// buffer is inline, `size_of::<TaskStorageInline>()` defines the exact "head
/// region" of the allocation, with the tail bytes living immediately after.
///
/// For now `Head` is just an organizational grouping that derives `Default`
/// and `Debug` so `TaskStorageInner`'s own derives continue to work.
fn generate_typed_storage_struct(grouped_fields: &GroupedFields) -> TokenStream {
    let has_lazy = grouped_fields.has_lazy();
    let has_flags = grouped_fields.has_flags();

    // Inline field definitions for the head struct.
    let inline_field_defs: Vec<_> = grouped_fields
        .all_inline()
        .map(|field| {
            let field_name = &field.field_name;
            let field_type = &field.field_type;
            quote! {
                #field_name: #field_type
            }
        })
        .collect();

    // Flags bitfield: lives directly on TaskStorageInner (not in head) because
    // many call sites — both macro emission and hand-written backend code —
    // read/write flags as `task.flags.method()` without going through a
    // typed accessor. Keeping it at the TaskStorageInner level avoids touching
    // every one of those.
    let flags_field = if has_flags {
        quote! {
            #[doc = "Combined bitfield for boolean flags (persisted + transient)"]
            pub(crate) flags: TaskFlags,
        }
    } else {
        quote! {}
    };

    // Bitmap + heap buffer for lazy payloads. Also lives directly on
    // TaskStorageInner; step 3 will collapse its `ptr` field by inlining the
    // bytes into TaskStorageInner's allocation.
    let lazy_field = if has_lazy {
        quote! {
            #[doc = "Bitmap + heap buffer holding the lazy-field payloads in tag order."]
            pub(crate) lazy_tail: crate::backend::lazy_tail::LazyTail,
        }
    } else {
        quote! {}
    };

    // `Head` always exists for symmetry with the lazy-tail story (so callers
    // can always reach inline fields via `task.inline.<field>`), but when the
    // schema has no inline fields it's a unit-shaped struct.
    quote! {
        #[doc = "The schema's inline fields grouped into one struct."]
        #[doc = ""]
        #[doc = "Lives on [`TaskStorageInner`] as `head`. Step 3 of the storage refactor"]
        #[doc = "will exploit the boundary at `size_of::<TaskStorageInline>()` to lay"]
        #[doc = "out the lazy-field byte tail in the same allocation."]
        #[automatically_derived]
        #[derive(Debug, Default, turbo_tasks::ShrinkToFit)]
        #[shrink_to_fit(crate = "turbo_tasks::macro_helpers::shrink_to_fit")]
        pub struct TaskStorageInline {
            #(#inline_field_defs,)*
        }

        #[doc = "Unified typed storage containing all task fields."]
        #[doc = ""]
        #[doc = "Inline fields (the ones declared with `inline` in the schema) live"]
        #[doc = "in `head`. `flags` and `lazy_tail` stay at the top level for now —"]
        #[doc = "lots of code reads them as bare field accesses, and folding them in"]
        #[doc = "is a separate refactor."]
        #[doc = ""]
        #[doc = "Doesn't derive `Debug`: pretty-printing the lazy tail needs a"]
        #[doc = "pointer to the tail bytes, which only the owning"]
        #[doc = "[`crate::backend::task_storage::TaskStorage`] has. The custom"]
        #[doc = "`Debug` impl on `TaskStorage` formats both the inline head and"]
        #[doc = "each present lazy payload."]
        #[automatically_derived]
        #[derive(Default, turbo_tasks::ShrinkToFit)]
        #[shrink_to_fit(crate = "turbo_tasks::macro_helpers::shrink_to_fit")]
        pub struct TaskStorageInner {
            pub(crate) inline: TaskStorageInline,
            #flags_field
            #lazy_field
        }

        #[automatically_derived]
        impl TaskStorageInner {
            pub fn new() -> Self {
                Self::default()
            }
        }
    }
}

fn generate_accessor_methods(grouped_fields: &GroupedFields) -> TokenStream {
    let mut storage_methods = TokenStream::new();
    let mut box_methods = TokenStream::new();

    // Generate accessor methods. Read-only and non-grow mutations live on
    // `TaskStorageInner`; grow-capable mutations (lazy `set_<name>` / `<name>_mut`
    // that may install a new payload) live on `TaskStorage` since only
    // the owning pointer can reallocate the unified head+tail buffer.
    for field in grouped_fields.all_fields() {
        let (on_storage, on_box) = generate_field_accessors_split(field);
        storage_methods.extend(on_storage);
        box_methods.extend(on_box);
    }

    quote! {
        #[automatically_derived]
        impl TaskStorageInner {
            #storage_methods
        }

        #[automatically_derived]
        impl crate::backend::task_storage::TaskStorage {
            #box_methods
        }
    }
}

/// Generate accessor methods on TaskStorageInner for a field.
///
/// Works for both inline and lazy fields. Uses FieldInfo helpers to generate
/// the appropriate access patterns. Returns `(on_storage, on_box)`:
///
/// - `on_storage` is emitted in `impl TaskStorageInner` and holds the read-only / non-grow
///   accessors (`get_{field}`, `take_{field}`, inline mutations).
/// - `on_box` is emitted in `impl TaskStorage` and holds grow-capable accessors (`set_{field}` and
///   `{field}_mut` for lazy fields whose install path may need to reallocate the unified head+tail
///   buffer).
fn generate_field_accessors_split(field: &FieldInfo) -> (TokenStream, TokenStream) {
    let field_name = &field.field_name;
    let field_type = &field.field_type;

    match field.storage_type {
        StorageType::Direct => generate_direct_field_accessors_split(field),
        StorageType::AutoSet | StorageType::AutoMap | StorageType::CounterMap => {
            generate_collection_field_accessors_split(field, field_name, field_type)
        }
        StorageType::Flag => {
            // Flag fields have accessors generated on TaskFlags, not TaskStorageInner
            unreachable!("Flag fields should not reach generate_field_accessors")
        }
    }
}

/// Generate Direct field accessors. Returns `(on_storage, on_box)`:
/// the methods that go in `impl TaskStorageInner` and `impl TaskStorage`
/// respectively. Lazy-direct `set_<name>` lives on the box because it may
/// install a new payload, which may need to grow the unified allocation.
fn generate_direct_field_accessors_split(field: &FieldInfo) -> (TokenStream, TokenStream) {
    let field_name = &field.field_name;
    let field_type = &field.field_type;
    let vis = if field.is_pub {
        quote! {pub}
    } else {
        quote! {}
    };

    let get_name = field.get_ident();
    let set_name = field.set_ident();
    let take_name = field.take_ident();
    let get_mut_name = field.get_mut_ident();

    if field.is_inline() && field.use_default {
        // Inline with default: field is T stored on `self.inline`, with
        // `Default::default()` standing in for "empty". No grow needed.
        let storage = quote! {
            #vis fn #get_name(&self) -> Option<&#field_type> {
                if self.inline.#field_name != #field_type::default() {
                    Some(&self.inline.#field_name)
                } else {
                    None
                }
            }

            #vis fn #set_name(&mut self, value: #field_type) -> Option<#field_type> {
                let old = std::mem::replace(&mut self.inline.#field_name, value);
                if old != #field_type::default() {
                    Some(old)
                } else {
                    None
                }
            }

            #vis fn #take_name(&mut self) -> Option<#field_type> {
                let old = std::mem::take(&mut self.inline.#field_name);
                if old != #field_type::default() {
                    Some(old)
                } else {
                    None
                }
            }
        };
        (storage, quote! {})
    } else if field.is_inline() {
        // Inline: field is `Option<T>` stored on `self.inline`. No grow.
        let inner_type = extract_option_inner_type(field_type);
        let storage = quote! {
            #vis fn #get_name(&self) -> Option<&#inner_type> {
                self.inline.#field_name.as_ref()
            }

            #vis fn #set_name(&mut self, value: #inner_type) -> Option<#inner_type> {
                self.inline.#field_name.replace(value)
            }

            #vis fn #take_name(&mut self) -> Option<#inner_type> {
                self.inline.#field_name.take()
            }
        };
        (storage, quote! {})
    } else {
        // Lazy direct field. All accessors live on `TaskStorage` (the
        // owning thin pointer) so they can compute the tail base from
        // `TaskStorage`'s `NonNull<TaskStorageInner>`, which carries
        // provenance over the full head+tail allocation. An `&self:
        // &TaskStorageInner` reference has provenance only for the head
        // bytes and would be UB under Stacked Borrows to read past
        // `size_of::<TaskStorageInner>()`.
        let tag_ident = field.tag_ident();
        let on_box = quote! {
            #vis fn #get_name(&self) -> Option<&#field_type> {
                self.lazy_find(#tag_ident)
            }

            #vis fn #take_name(&mut self) -> Option<#field_type> {
                self.lazy_take(#tag_ident)
            }

            #[doc = "Get a mutable reference to the field value (if present)."]
            #[doc = ""]
            #[doc = "Does NOT allocate if the field is absent — returns None instead."]
            #vis fn #get_mut_name(&mut self) -> Option<&mut #field_type> {
                self.lazy_find_mut(#tag_ident)
            }

            #[doc = "Set the field value, returning the old value if present."]
            #[doc = ""]
            #[doc = "May reallocate the underlying buffer when the variant"]
            #[doc = "wasn't previously present."]
            #vis fn #set_name(&mut self, value: #field_type) -> Option<#field_type> {
                self.lazy_replace(#tag_ident, value)
            }
        };
        (quote! {}, on_box)
    }
}

/// Generate collection field accessors split between TaskStorageInner and
/// TaskStorage. The lazy `<field>_mut` accessor goes on the box because
/// installing a default-constructed collection (when absent) may need to
/// grow the unified buffer.
fn generate_collection_field_accessors_split(
    field: &FieldInfo,
    field_name: &syn::Ident,
    field_type: &syn::Type,
) -> (TokenStream, TokenStream) {
    let ref_name = field.ref_ident();
    let mut_name = field.mut_ident();
    let take_name = field.take_ident();
    let vis = if field.is_pub {
        quote! {pub}
    } else {
        quote! {}
    };

    if field.is_inline() {
        // Inline: field lives on `self.inline`. No grow needed.
        let storage = quote! {
            #vis fn #ref_name(&self) -> &#field_type {
                &self.inline.#field_name
            }

            #vis fn #mut_name(&mut self) -> &mut #field_type {
                &mut self.inline.#field_name
            }

            #vis fn #take_name(&mut self) -> #field_type {
                std::mem::take(&mut self.inline.#field_name)
            }
        };
        (storage, quote! {})
    } else {
        // Lazy collection field. All accessors live on `TaskStorage` so
        // they can derive the tail pointer from `TaskStorage`'s
        // `NonNull<TaskStorageInner>` (which has provenance over the full
        // head+tail allocation). Reading the tail from an
        // `&TaskStorageInner` would be UB under Stacked Borrows since
        // that reference's provenance only covers the head bytes.
        let tag_ident = field.tag_ident();
        let get_mut_name = field.get_mut_ident();
        let on_box = quote! {
            #vis fn #ref_name(&self) -> Option<&#field_type> {
                self.lazy_find(#tag_ident)
            }

            #vis fn #take_name(&mut self) -> Option<#field_type> {
                self.lazy_take(#tag_ident)
            }

            #[doc = "Get a mutable reference to the collection if present,"]
            #[doc = "without allocating. Returns `None` for absent variants."]
            #[doc = ""]
            #[doc = "Use this when the caller wants to mutate the collection"]
            #[doc = "in-place (e.g. `shrink_to_fit`) without paying the byte"]
            #[doc = "shifts of `take` + `<name>_mut()` reinstall."]
            #vis fn #get_mut_name(&mut self) -> Option<&mut #field_type> {
                self.lazy_find_mut(#tag_ident)
            }

            #[doc = "Get a mutable reference to the collection, installing a"]
            #[doc = "fresh `Default::default()` if absent. May reallocate the"]
            #[doc = "underlying buffer when installing."]
            #vis fn #mut_name(&mut self) -> &mut #field_type {
                self.lazy_get_or_create(#tag_ident)
            }
        };
        (quote! {}, on_box)
    }
}

/// Generates the TaskStorageAccessors trait with accessor methods for all fields.
///
/// This trait defines:
/// 1. Required methods: `typed()` and `typed_mut(category)` that implementors must provide
/// 2. Provided methods: accessor methods for all fields
///
/// The trait is designed to be used with TaskGuard, which implements the required methods
/// and gets all the accessor methods for free.
fn generate_task_storage_accessors_trait(grouped_fields: &GroupedFields) -> TokenStream {
    let mut trait_methods = TokenStream::new();

    // Generate accessor methods for all fields (including flags)
    for field in &grouped_fields.fields {
        trait_methods.extend(generate_trait_accessor_methods(field));
    }

    // Generate cleanup_after_execution method
    let cleanup_method = generate_cleanup_after_execution(grouped_fields);

    quote! {
        #[doc = "Trait for typed storage accessors."]
        #[doc = ""]
        #[doc = "This trait is auto-generated by the TaskStorageInner macro."]
        #[doc = "Implementors only need to provide `typed()`, `typed_mut()`, `track_modification()`,"]
        #[doc = "and `check_access()` methods, and all accessor methods are provided automatically."]
        #[doc = ""]
        #[doc = "This is designed to work with TaskGuard."]
        #[automatically_derived]
        pub trait TaskStorageAccessors {
            #[doc = "Access the owning `TaskStorage` (read-only)."]
            #[doc = ""]
            #[doc = "Returns the owning pointer so that callers needing to grow the"]
            #[doc = "underlying allocation (step 3 of the storage refactor) have access"]
            #[doc = "to it. Most accessor calls go through `Deref<Target = TaskStorageInner>`"]
            #[doc = "on `TaskStorage`, so callsites read like `self.typed().<field>()`"]
            #[doc = "regardless of whether the method lives on the box or the inner."]
            fn typed(&self) -> &crate::backend::task_storage::TaskStorage;

            #[doc = "Access the owning `TaskStorage` (mutable)."]
            #[doc = ""]
            #[doc = "Note: This does NOT track modifications. Call `track_modification()` separately"]
            #[doc = "when the data actually changes. This split allows generated accessors to"]
            #[doc = "only track modifications when actual changes occur."]
            fn typed_mut(&mut self) -> &mut crate::backend::task_storage::TaskStorage;

            #[doc = "Track that a modification occurred for the given category."]
            #[doc = ""]
            #[doc = "Should be called after confirming that data actually changed."]
            #[doc = "This is separate from `typed_mut()` to allow optimizations where"]
            #[doc = "we only track modifications when something actually changes."]
            fn track_modification(&mut self, category: crate::backend::storage::SpecificTaskDataCategory, name: &str);

            #[doc = "Verify that the task was accessed with the correct category before reading/writing."]
            #[doc = ""]
            #[doc = "This is a debug assertion that catches bugs where code tries to access data"]
            #[doc = "without having restored it from storage first."]
            #[doc = ""]
            #[doc = "The category parameter uses `SpecificTaskDataCategory`:"]
            #[doc = "- `Data` or `Meta`: Checks that the task was accessed with that category"]
            #[doc = ""]
            #[doc = "Implementors should check that the provided category matches how the task was accessed."]
            fn check_access(&self, category: crate::backend::storage::SpecificTaskDataCategory);

            #[doc = "Shrink all collection fields to fit their current contents."]
            #[doc = ""]
            #[doc = "This releases excess memory from hash maps and hash sets that may have"]
            #[doc = "grown larger than needed during task execution."]
            #[doc = ""]
            #[doc = "Note: This does NOT track modifications since shrink_to_fit doesn't"]
            #[doc = "semantically change the data - it only reduces memory usage."]
            fn shrink_to_fit(&mut self) {
                self.typed_mut().shrink_to_fit();
            }


            #cleanup_method

            #trait_methods

        }
    }
}

/// Generates trait accessor methods for a field (works for both inline and lazy storage).
///
/// Uses `FieldInfo` helpers to generate the correct access patterns:
/// - For inline: direct field access via `self.typed().field` / `self.typed_mut().field`
/// - For lazy: delegates to TaskStorageInner accessors
fn generate_trait_accessor_methods(field: &FieldInfo) -> TokenStream {
    let field_type = &field.field_type;
    let check_access = field.check_access_call();
    let ref_expr = field.collection_ref_expr();
    let is_option = field.is_option_ref();

    match field.storage_type {
        StorageType::Direct => {
            // Direct storage delegates to TaskStorageInner accessor methods
            generate_direct_accessors(field)
        }
        StorageType::AutoSet => {
            // For AutoSet types, generate read-only accessor, mutable accessor, and
            // add/remove/has/iter/len/is_empty
            let ref_name = field.ref_ident();

            let (return_type, doc_comment) = if is_option {
                (
                    quote! { Option<&#field_type> },
                    "/// Get a reference to the collection (may be None if not allocated, \
                     read-only)",
                )
            } else {
                (
                    quote! { &#field_type },
                    "/// Get a reference to the collection (read-only)",
                )
            };

            let base_accessor = quote! {
                #[doc = #doc_comment]
                fn #ref_name(&self) -> #return_type {
                    #check_access
                    #ref_expr
                }
            };

            let set_ops = generate_autoset_ops(field);

            quote! {
                #base_accessor
                #set_ops
            }
        }
        StorageType::CounterMap => {
            // For CounterMap types, generate read-only accessor, mutable accessor, and typed
            // mutation methods
            let ref_name = field.ref_ident();

            let (return_type, doc_comment) = if is_option {
                (
                    quote! { Option<&#field_type> },
                    "/// Get a reference to the collection (may be None if not allocated, \
                     read-only)",
                )
            } else {
                (
                    quote! { &#field_type },
                    "/// Get a reference to the collection (read-only)",
                )
            };

            let base_accessor = quote! {
                #[doc = #doc_comment]
                fn #ref_name(&self) -> #return_type {
                    #check_access
                    #ref_expr
                }
            };

            let countermap_ops = generate_countermap_ops(field);

            quote! {
                #base_accessor
                #countermap_ops
            }
        }
        StorageType::AutoMap => {
            // For AutoMap types, generate immutable and mutable accessors plus operation methods
            let ref_name = field.ref_ident();

            let (return_type, ref_doc) = if is_option {
                (
                    quote! { Option<&#field_type> },
                    "/// Get a reference to the collection (may be None if not allocated)",
                )
            } else {
                (
                    quote! { &#field_type },
                    "/// Get a reference to the collection",
                )
            };

            let base_accessor = quote! {
                #[doc = #ref_doc]
                fn #ref_name(&self) -> #return_type {
                    #check_access
                    #ref_expr
                }

            };

            let automap_ops = generate_automap_ops(field);

            quote! {
                #base_accessor
                #automap_ops
            }
        }
        StorageType::Flag => {
            // Flag fields are stored in the TaskFlags bitfield
            let field_name = &field.field_name;
            let set_name = field.set_ident();
            let track_modification = field.track_modification_call();

            quote! {
                #[doc = "Get the flag value"]
                fn #field_name(&self) -> bool {
                    #check_access
                    self.typed().flags.#field_name()
                }

                #[doc = "Set the flag value"]
                #[doc = ""]
                #[doc = "Only tracks modification if the value actually changes."]
                fn #set_name(&mut self, value: bool) {
                    #check_access
                    let current = self.typed().flags.#field_name();
                    if current != value {
                        #track_modification
                        self.typed_mut().flags.#set_name(value);
                    }
                }
            }
        }
    }
}

/// Generate Direct field accessors for TaskStorageAccessors trait.
///
/// Uses `FieldInfo` helpers to delegate to TaskStorageInner accessor methods,
/// which handle the inline/lazy difference internally.
///
/// Generates methods:
/// - `get_{field}_ref() -> Option<&T>` - Get reference to value
/// - `has_{field}() -> bool` - Check if value exists
/// - `set_{field}(value) -> Option<T>` - Set value, returning old value
/// - `take_{field}() -> Option<T>` - Take value, clearing the field
/// - `get_{field}_mut() -> Option<&mut T>` - Get mutable reference (lazy fields only)
fn generate_direct_accessors(field: &FieldInfo) -> TokenStream {
    let field_type = &field.field_type;
    let check_access = field.check_access_call();
    let track_modification = field.track_modification_call();

    // Use FieldInfo helpers for TaskStorageInner delegation
    let get_expr = field.direct_get_expr();
    let set_expr = field.direct_set_expr();
    let take_expr = field.direct_take_expr();

    // Method names
    let get_name = field.get_ident();
    let has_name = field.has_ident();
    let set_name = field.set_ident();
    let take_name = field.take_ident();

    // For inline fields, the type is Option<T> and we extract T.
    // For lazy fields, the type is T directly (Vec presence provides optionality).
    let value_type = if field.is_inline() {
        extract_option_inner_type(field_type)
    } else {
        quote! { #field_type }
    };

    // Generate get_mut accessor for all direct transient fields
    // We don't allow direct mutable access to persistent fields because it can interfere with
    // mutation tracking and snapshotting
    let get_mut_accessor = {
        if field.is_transient() {
            let get_mut_name = field.get_mut_ident();
            if field.is_inline() {
                // Inline fields live on `TaskStorageInner::head`.
                let field_name = &field.field_name;
                if field.use_default {
                    // For fields with default semantics, always return Some(&mut self.field)
                    quote! {
                        #[doc = "Get a mutable reference to the field value."]
                        fn #get_mut_name(&mut self) -> &mut #value_type {
                            #check_access
                            #track_modification
                            &mut self.typed_mut().inline.#field_name
                        }
                    }
                } else {
                    // For Option fields, return as_mut()
                    quote! {
                        #[doc = "Get a mutable reference to the field value (if present)."]
                        fn #get_mut_name(&mut self) -> Option<&mut #value_type> {
                            #check_access
                            #track_modification
                            self.typed_mut().inline.#field_name.as_mut()
                        }
                    }
                }
            } else {
                // For lazy fields, use the existing get_mut expression
                let get_mut_expr = field.direct_get_mut_expr();
                quote! {
                    #[doc = "Get a mutable reference to the field value (if present)."]
                    fn #get_mut_name(&mut self) -> Option<&mut #value_type> {
                        #check_access
                        #track_modification
                        #get_mut_expr
                    }
                }
            }
        } else {
            // Persistent fields don't allow direct mutable access as it interferes with mutation
            // tracking
            quote! {}
        }
    };

    let set_body = if field.is_transient() {
        quote! {
            #set_expr(value)
        }
    } else {
        // Equality-check, track, then delegate to TaskStorageInner's typed `set_*`.
        // Same shape for inline and lazy direct fields — the latter does its
        // own single-scan internally now.
        quote! {
            if #get_expr.is_some_and(|old| old == &value) {
                return None;
            }
            #track_modification
            #set_expr(value)
        }
    };

    let take_body = if field.is_transient() {
        quote! {
            #take_expr
        }
    } else {
        // Existence check, then delegate to TaskStorageInner's typed `take_*`.
        quote! {
            if #get_expr.is_some() {
                #track_modification
                #take_expr
            } else {
                None
            }
        }
    };

    quote! {
        #[doc = "Get a reference to the field value (if present)"]
        fn #get_name(&self) -> Option<&#value_type> {
            #check_access
            #get_expr
        }

        #[doc = "Check if this field has a value"]
        fn #has_name(&self) -> bool {
            #check_access
            #get_expr.is_some()
        }

        #[doc = "Set the field value, returning the old value if present."]
        fn #set_name(&mut self, value: #value_type) -> Option<#value_type> {
            #check_access
            #set_body
        }

        #[doc = "Take the field value, clearing it"]
        fn #take_name(&mut self) -> Option<#value_type> {
            #check_access
            #take_body
        }

        #get_mut_accessor
    }
}

/// Generate add/remove/has/iter/len/is_empty operations for an AutoSet field.
///
/// Uses `FieldInfo` helpers to generate the correct access patterns:
/// - For inline: direct field access via `self.typed().field` / `self.typed_mut().field`
/// - For lazy: delegates to TaskStorageInner accessors
///
/// Generates methods with `_item` suffix to distinguish single-item operations
/// from potential bulk operations: `add_X_item`, `remove_X_item`, `has_X_item`
fn generate_autoset_ops(field: &FieldInfo) -> TokenStream {
    let field_type = &field.field_type;

    let Some(element_type) = extract_set_element_type(field_type) else {
        return quote! {};
    };

    let check_access = field.check_access_call();
    let track_modification = field.track_modification_call();
    let mut_expr = field.collection_mut_expr();
    let ref_expr = field.collection_ref_expr();

    let take_expr = field.direct_take_expr();
    let is_option = field.is_option_ref();

    let add_name = field.prefixed_ident("add");
    let extend_name = field.prefixed_ident("extend");
    let remove_name = field.prefixed_ident("remove");
    let set_name = field.prefixed_ident("set");
    let has_name = field.suffixed_ident("contains");
    let iter_name = field.iter_ident();
    let len_name = field.len_ident();
    let is_empty_name = field.is_empty_ident();

    // Generate bodies based on whether ref access returns Option or not
    let has_body = if is_option {
        quote! { #ref_expr.is_some_and(|set| set.contains(item)) }
    } else {
        quote! { #ref_expr.contains(item) }
    };

    let iter_body = if is_option {
        quote! { #ref_expr.into_iter().flat_map(|set| set.iter().copied()) }
    } else {
        quote! { #ref_expr.iter().copied() }
    };

    let len_body = if is_option {
        quote! { #ref_expr.map_or(0, |set| set.len()) }
    } else {
        quote! { #ref_expr.len() }
    };

    let is_empty_body = if is_option {
        quote! { #ref_expr.is_none_or(|set| set.is_empty()) }
    } else {
        quote! { #ref_expr.is_empty() }
    };

    // For transient fields, track_modification is a no-op so skip all guards.
    let remove_body;
    let add_body;
    let set_body;
    let extend_body;

    if field.is_transient() {
        remove_body = quote! {
            #mut_expr.remove(item)
        };
        add_body = quote! {
            #mut_expr.insert(item)
        };
        // For transient fields no equality / track_modification guard is
        // needed. Lazy and inline share the same shape: take old, install new.
        // `#take_expr` returns `Option<T>` for lazy and `T` for inline; the
        // `is_option` branch normalizes the outer return shape accordingly.
        set_body = if is_option {
            quote! {
                let old = #take_expr;
                *#mut_expr = set;
                old
            }
        } else {
            quote! {
                let old = #take_expr;
                *#mut_expr = set;
                Some(old)
            }
        };
        extend_body = quote! {
            #mut_expr.extend(items);
        };
    } else {
        // Remove: only track modification if the item exists.
        // Lazy and inline collection fields share the same code shape, since the
        // accessor expressions (`#ref_expr`, `#mut_expr`, `#take_expr`) handle
        // the lookup internally. For lazy collections each scan is a single
        // per-variant inline match; for inline fields it's a direct field
        // access. Either way the "double scan" cost of separating the
        // existence check from the mutation is bounded by the lazy area size
        // (p99 ≤ 7 entries today).

        remove_body = if is_option {
            quote! {
                if !#ref_expr.is_some_and(|val| val.contains(item)) {
                    return false;
                }
                #track_modification
                // We just checked the entry exists, so `#mut_expr`'s
                // implicit allocate-if-absent path doesn't fire.
                #mut_expr.remove(item)
            }
        } else {
            quote! {
                if !#ref_expr.contains(item) {
                    return false;
                }
                #track_modification
                #mut_expr.remove(item)
            }
        };

        add_body = if is_option {
            quote! {
                if #ref_expr.is_some_and(|existing| existing.contains(&item)) {
                    return false;
                }
                #track_modification
                #mut_expr.insert(item)
            }
        } else {
            quote! {
                if #ref_expr.contains(&item) {
                    return false;
                }
                #track_modification
                #mut_expr.insert(item)
            }
        };

        set_body = if is_option {
            quote! {
                if #ref_expr.is_some_and(|old| old == &set) {
                    return None;
                }
                #track_modification
                let old = #take_expr;
                *#mut_expr = set;
                old
            }
        } else {
            quote! {
                if #ref_expr == &set {
                    return None;
                }
                #track_modification
                let old = #take_expr;
                *#mut_expr = set;
                Some(old)
            }
        };

        extend_body = if is_option {
            quote! {
                let mut iter = items.into_iter().peekable();
                if let Some(existing) = #ref_expr {
                    // Skip items already in the set
                    loop {
                        match iter.peek() {
                            None => return,
                            Some(item) if existing.contains(item) => { iter.next(); }
                            Some(_) => break,
                        }
                    }
                    #track_modification
                    #mut_expr.extend(iter);
                } else {
                    // Set doesn't exist yet - if iterator is empty, nothing to do
                    if iter.peek().is_none() {
                        return;
                    }
                    #track_modification
                    #mut_expr.extend(iter);
                }
            }
        } else {
            quote! {
                let mut iter = items.into_iter().peekable();
                // Skip items already in the set until we find a new one
                loop {
                    match iter.peek() {
                        None => return,
                        Some(item) if #ref_expr.contains(item) => { iter.next(); }
                        Some(_) => break,
                    }
                }
                // Found a new item - track modification and insert remaining items
                #track_modification
                #mut_expr.extend(iter);
            }
        };
    }

    quote! {
        #[doc = "Check if the set contains an item"]
        fn #has_name(&self, item: &#element_type) -> bool {
            #check_access
            #has_body
        }

        #[doc = "Add an item to the set."]
        #[doc = "Returns true if the item was newly added, false if it already existed."]
        #[doc = "Only tracks modification if the item is actually added."]
        #[must_use]
        fn #add_name(&mut self, item: #element_type) -> bool {
            #check_access
            #add_body
        }

        #[doc = "Add multiple items to the set from an iterator."]
        #[doc = "Only tracks modification if at least one item is actually added."]
        fn #extend_name(&mut self, items: impl IntoIterator<Item = #element_type>) {
            #check_access
            #extend_body
        }

        #[doc = "Remove an item from the set."]
        #[doc = "Returns true if the item was present and removed, false if it wasn't present."]
        fn #remove_name(&mut self, item: &#element_type) -> bool {
            #check_access
            #remove_body
        }

        #[doc = "Replace the entire set, returning the old set if present."]
        #[doc = "Only tracks modification if the set actually changes."]
        fn #set_name(&mut self, set: #field_type) -> Option<#field_type>
        {
            #check_access
            #set_body
        }

        #[doc = "Iterate over all items in the set"]
        fn #iter_name(&self) -> impl Iterator<Item = #element_type> + '_ {
            #check_access
            #iter_body
        }

        #[doc = "Get the number of items in the set"]
        fn #len_name(&self) -> usize {
            #check_access
            #len_body
        }

        #[doc = "Check if the set is empty"]
        fn #is_empty_name(&self) -> bool {
            #check_access
            #is_empty_body
        }
    }
}

/// Generate CounterMap operations for a field (works for both inline and lazy storage).
///
/// Uses `FieldInfo` helpers to generate the correct access patterns:
/// - For inline: direct field access via `self.typed().field` / `self.typed_mut().field`
/// - For lazy: delegates to TaskStorageInner accessors via `self.typed().field()` /
///   `self.typed_mut().field_mut()`
///
/// Generates methods for:
/// - `update_{field}_count(key, delta) -> bool` - Returns true if crossed zero boundary
/// - `update_and_get_{field}(key, delta) -> V` - Returns new value
/// - `update_{field}(key, f)` - Closure-based update
/// - `add_{field}(key, value)` - Insert new, panics if exists
/// - `remove_{field}(key) -> Option<V>` - Standard HashMap remove
/// - `get_{field}(key) -> Option<&V>` - Single-item lookup
///
/// Additionally, for i32 value types only (signed counters):
/// - `update_{field}_positive_crossing(key, delta) -> bool` - Track positive boundary crossing
///
/// Note: CounterMap only supports `i32` and `u32` value types. Other types will produce
/// a compile error.
fn generate_countermap_ops(field: &FieldInfo) -> TokenStream {
    let field_type = &field.field_type;

    let Some((key_type_raw, value_type_raw)) = extract_map_types_raw(field_type, "CounterMap")
    else {
        return quote! {};
    };

    // Enforce that value type is either i32 or u32
    let is_signed = is_type_i32(value_type_raw);
    let is_unsigned = is_type_u32(value_type_raw);
    if !is_signed && !is_unsigned {
        return syn::Error::new(
            value_type_raw.span(),
            "CounterMap value type must be `i32` or `u32`",
        )
        .to_compile_error();
    }

    let key_type = quote! { #key_type_raw };
    let value_type = quote! { #value_type_raw };

    let check_access = field.check_access_call();
    let track_modification = field.track_modification_call();
    let mut_expr = field.collection_mut_expr();
    let ref_expr = field.collection_ref_expr();
    let is_option = field.is_option_ref();

    // Method names - use shorter names to match existing API
    let update_count_name = field.infixed_ident("update", "count");
    let update_counts_name = field.infixed_ident("update", "counts");
    let update_and_get_name = field.prefixed_ident("update_and_get");
    let update_with_name = field.prefixed_ident("update");
    let add_entry_name = field.prefixed_ident("add");
    let remove_name = field.prefixed_ident("remove");
    let get_name = field.prefixed_ident("get");
    let iter_name = field.prefixed_ident("iter");
    let len_name = field.len_ident();
    let is_empty_name = field.is_empty_ident();

    // Generate get_entry body based on whether ref access returns Option or not
    let get_body = if is_option {
        quote! { #ref_expr.and_then(|m| m.get(key)) }
    } else {
        quote! { #ref_expr.get(key) }
    };

    // Generate remove body. Both inline and lazy storage use the same shape
    // now: check existence via `#ref_expr` (lazy lookup is a single per-variant
    // inline scan), track if present, then remove. `#mut_expr` for lazy fields
    // creates an empty entry if absent — but we just checked existence, so the
    // create path never fires.
    let remove_body = if field.is_transient() {
        quote! {
            #track_modification
            #mut_expr.remove(key)
        }
    } else if is_option {
        quote! {
            if !#ref_expr.is_some_and(|m| m.get(key).is_some()) {
                return None;
            }
            #track_modification
            #mut_expr.remove(key)
        }
    } else {
        quote! {
            self.#get_name(key)?;
            #track_modification
            #mut_expr.remove(key)
        }
    };

    // Generate len body
    let len_body = if is_option {
        quote! { #ref_expr.map_or(0, |m| m.len()) }
    } else {
        quote! { #ref_expr.len() }
    };

    // Generate is_empty body
    let is_empty_body = if is_option {
        quote! { #ref_expr.is_none_or(|m| m.is_empty()) }
    } else {
        quote! { #ref_expr.is_empty() }
    };

    // Generate iter_entries body
    let iter_body = if is_option {
        quote! { #ref_expr.into_iter().flat_map(|m| m.iter()) }
    } else {
        quote! { #ref_expr.iter() }
    };

    // Generate signed-type-specific methods only for i32
    let signed_methods = if is_signed {
        let update_positive_crossing_name = field.infixed_ident("update", "positive_crossing");
        let update_positive_crossing_body = if field.is_transient() {
            quote! {
                #mut_expr.update_positive_crossing(key, delta)
            }
        } else {
            quote! {
                if delta == 0 {
                    return false;
                }
                #track_modification
                #mut_expr.update_positive_crossing(key, delta)
            }
        };

        quote! {
            #[doc = "Update a signed counter by the given delta."]
            #[doc = "Returns true if the count crossed the positive boundary (became positive or non-positive)."]
            #[must_use]
            fn #update_positive_crossing_name(&mut self, key: #key_type, delta: #value_type) -> bool {
                #check_access
                #update_positive_crossing_body
            }
        }
    } else {
        quote! {}
    };

    let update_count_body = if field.is_transient() {
        quote! {
            #mut_expr.update_count(key, delta)
        }
    } else {
        quote! {
            if delta == 0 {
                return false;
            }
            #track_modification
            #mut_expr.update_count(key, delta)
        }
    };

    let update_counts_body = if field.is_transient() {
        quote! {
            let map = #mut_expr;
            for key in keys {
                map.update_count(key, delta);
            }
        }
    } else {
        quote! {
            if delta == 0 {
                return;
            }
            #track_modification
            let map = #mut_expr;
            for key in keys {
                map.update_count(key, delta);
            }
        }
    };

    let update_and_get_body = if field.is_transient() {
        quote! {
            #mut_expr.update_and_get(key, delta)
        }
    } else {
        quote! {
            if delta == 0 {
                return self.#get_name(&key).copied().unwrap_or_default();
            }
            #track_modification
            #mut_expr.update_and_get(key, delta)
        }
    };

    // The lazy and inline shapes for `update_with` are now identical: they
    // both read the old value through `#ref_expr`, compute the new value, and
    // route to insert/remove via `#mut_expr`. `#mut_expr` for lazy fields
    // creates an empty entry if absent — exactly what we want when inserting
    // into a previously-absent map.
    let update_with_body = if field.is_transient() {
        quote! {
            #mut_expr.update_with(key, f)
        }
    } else {
        let read_old = if is_option {
            quote! { #ref_expr.and_then(|m| m.get(&key).copied()) }
        } else {
            quote! { #ref_expr.get(&key).copied() }
        };
        quote! {
            let old_value = #read_old;
            let new_value = f(old_value);
            if old_value != new_value {
                #track_modification
                match new_value {
                    Some(value) => { #mut_expr.insert(key, value); }
                    None => { #mut_expr.remove(&key); }
                }
            }
        }
    };

    quote! {
        #[doc = "Get a single entry from the counter map"]
        fn #get_name(&self, key: &#key_type) -> Option<&#value_type> {
            #check_access
            #get_body
        }

        #[doc = "Update a counter by the given delta."]
        #[doc = "Returns true if the count crossed zero (became zero or became non-zero)."]
        #[must_use]
        fn #update_count_name(&mut self, key: #key_type, delta: #value_type) -> bool {
            #check_access
            #update_count_body
        }

        #[doc = "Update multiple counters by the given delta."]
        #[doc = "More efficient than calling update_count in a loop."]
        fn #update_counts_name(&mut self, keys: impl Iterator<Item = #key_type>, delta: #value_type) {
            #check_access
            #update_counts_body
        }

        #[doc = "Update a counter by the given delta and return the new value."]
        fn #update_and_get_name(&mut self, key: #key_type, delta: #value_type) -> #value_type {
            #check_access
            #update_and_get_body
        }

        #[doc = "Update a counter using a closure that receives the current value"]
        #[doc = "(or None if not present) and returns the new value (or None to remove)."]
        fn #update_with_name<F>(&mut self, key: #key_type, f: F)
        where
            F: FnOnce(Option<#value_type>) -> Option<#value_type>,
        {
            #check_access
            #update_with_body
        }

        #[doc = "Add a new entry, panicking if the entry already exists."]
        fn #add_entry_name(&mut self, key: #key_type, value: #value_type) {
            #check_access
            #track_modification
            #mut_expr.add_entry(key, value)
        }

        #[doc = "Remove an entry, returning the value if present."]
        #[doc = "Only tracks modification if an entry was actually removed."]
        fn #remove_name(&mut self, key: &#key_type) -> Option<#value_type> {
            #check_access
            #remove_body
        }

        #[doc = "Get the number of entries in the counter map"]
        fn #len_name(&self) -> usize {
            #check_access
            #len_body
        }

        #[doc = "Check if the counter map is empty"]
        fn #is_empty_name(&self) -> bool {
            #check_access
            #is_empty_body
        }

        #[doc = "Iterate over all key-value pairs in the counter map. Guaranteed to return non-zero values."]
        fn #iter_name(&self) -> impl Iterator<Item = (&#key_type, &#value_type)> + '_ {
            #check_access
            #iter_body
        }

        #signed_methods
    }
}

/// Generate AutoMap operations for a field (works for both inline and lazy storage).
///
/// Uses `FieldInfo` helpers to generate the correct access patterns:
/// - For inline: direct field access via `self.typed().field` / `self.typed_mut().field`
/// - For lazy: delegates to TaskStorageInner accessors
///
/// Generates methods (using `_entry` suffix for consistency with CounterMap):
/// - `get_{field}_entry(key) -> Option<&V>` - Single-item lookup
/// - `has_{field}_entry(key) -> bool` - Check if key exists
/// - `insert_{field}_entry(key, value) -> Option<V>` - Insert or replace
/// - `remove_{field}_entry(key) -> Option<V>` - Remove entry
/// - `iter_{field}_entries() -> impl Iterator<Item = (&K, &V)>` - Iterate all
/// - `{field}_len() -> usize` - Get count
/// - `is_{field}_empty() -> bool` - Check if empty
fn generate_automap_ops(field: &FieldInfo) -> TokenStream {
    let field_type = &field.field_type;

    // If the field uses a newtype wrapper, `as_type` gives us the actual
    // `AutoMap<K, V>` to extract key/value types from. Otherwise parse the
    // declared field type directly.
    let map_ty = field.as_type.as_ref().unwrap_or(field_type);

    let Some((key_type, value_type)) = extract_map_types(map_ty, "AutoMap") else {
        return quote! {};
    };

    let check_access = field.check_access_call();
    let track_modification = field.track_modification_call();
    let mut_expr = field.collection_mut_expr();
    let ref_expr = field.collection_ref_expr();
    let is_option = field.is_option_ref();

    let get_entry_name = field.prefixed_ident("get");
    let has_entry_name = field.suffixed_ident("contains");
    let insert_entry_name = field.prefixed_ident("insert");
    let remove_entry_name = field.prefixed_ident("remove");
    let iter_entries_name = field.prefixed_ident("iter");
    let take_name = field.prefixed_ident("take");
    let len_name = field.len_ident();
    let is_empty_name = field.is_empty_ident();

    // Generate bodies based on whether ref access returns Option or not
    let get_entry_body = if is_option {
        quote! { #ref_expr.and_then(|m| m.get(key)) }
    } else {
        quote! { #ref_expr.get(key) }
    };

    let has_entry_body = if is_option {
        quote! { #ref_expr.is_some_and(|m| m.contains_key(key)) }
    } else {
        quote! { #ref_expr.contains_key(key) }
    };

    let iter_body = if is_option {
        quote! { #ref_expr.into_iter().flat_map(|m| m.iter()) }
    } else {
        quote! { #ref_expr.iter() }
    };

    let len_body = if is_option {
        quote! { #ref_expr.map_or(0, |m| m.len()) }
    } else {
        quote! { #ref_expr.len() }
    };

    let is_empty_body = if is_option {
        quote! { #ref_expr.is_none_or(|m| m.is_empty()) }
    } else {
        quote! { #ref_expr.is_empty() }
    };

    let take_expression = {
        let take_name = field.take_ident();
        quote! {self.typed_mut().#take_name()}
    };

    // Generate remove body. Both inline and lazy use the same shape: check
    // existence via the typed accessor, then route through `#mut_expr`. For
    // lazy fields `#mut_expr` allocates an empty map if absent — but we just
    // confirmed an entry exists, so the create path never fires.
    let remove_body = if field.is_transient() {
        quote! {
            #mut_expr.remove(key)
        }
    } else if is_option {
        quote! {
            if !#ref_expr.is_some_and(|m| m.get(key).is_some()) {
                return None;
            }
            #track_modification
            #mut_expr.remove(key)
        }
    } else {
        quote! {
            if !self.#has_entry_name(key) {
                return None;
            }
            #track_modification
            #mut_expr.remove(key)
        }
    };

    let take_body = if field.is_transient() {
        quote! {
            #take_expression
        }
    } else if is_option {
        // Check emptiness via the typed ref accessor, then delegate to
        // TaskStorageInner's `take_<name>` (which returns `Option<T>` for lazy
        // collections — exactly the shape this outer method returns).
        quote! {
            if #ref_expr.is_none_or(|m| m.is_empty()) {
                return None;
            }
            #track_modification
            #take_expression
        }
    } else {
        // Inline collection: `take_<name>` returns `T`, so wrap.
        quote! {
            if self.#is_empty_name() {
                return None;
            }
            #track_modification
            Some(#take_expression)
        }
    };

    quote! {
        #[doc = "Get an entry from the map by key"]
        fn #get_entry_name(&self, key: &#key_type) -> Option<&#value_type> {
            #check_access
            #get_entry_body
        }

        #[doc = "Check if the map contains a key"]
        fn #has_entry_name(&self, key: &#key_type) -> bool {
            #check_access
            #has_entry_body
        }

        #[doc = "Insert an entry, returning the old value if present."]
        fn #insert_entry_name(&mut self, key: #key_type, value: #value_type) -> Option<#value_type> {
            #check_access
            #track_modification
            #mut_expr.insert(key, value)
        }


        #[doc = "Remove an entry, returning the value if present."]
        #[doc = "Only tracks modification if an entry was actually removed."]
        fn #remove_entry_name(&mut self, key: &#key_type) -> Option<#value_type> {
            #check_access
            #remove_body
        }


        #[doc = "Remove the full map and return it"]
        #[doc = "Only tracks modification if the map is non-empty."]
        fn #take_name(&mut self) -> Option<#field_type> {
            #check_access
            #take_body
        }

        #[doc = "Iterate over all key-value pairs in the map"]
        fn #iter_entries_name(&self) -> impl Iterator<Item = (&#key_type, &#value_type)> + '_ {
            #check_access
            #iter_body
        }

        #[doc = "Get the number of entries in the map"]
        fn #len_name(&self) -> usize {
            #check_access
            #len_body
        }

        #[doc = "Check if the map is empty"]
        fn #is_empty_name(&self) -> bool {
            #check_access
            #is_empty_body
        }
    }
}

/// Generate the cleanup_after_execution method that processes lazy fields in a single pass.
///
/// This method:
/// 1. Queries `self.typed().flags.immutable()` once
/// 2. Shrinks any inline collection fields with `shrink_on_completion`
/// 3. Uses swap_retain pattern to process all lazy fields in one pass
/// 4. For fields with `shrink_on_completion`: shrink or remove if empty
/// 5. For fields with `drop_on_completion_if_immutable` when task is immutable: remove
fn generate_cleanup_after_execution(grouped_fields: &GroupedFields) -> TokenStream {
    // Generate cleanup calls for inline collection fields.
    // Invalid attribute combinations (e.g. shrink/drop on non-collection fields) are rejected
    // during parsing, so we can generate code unconditionally here.
    let mut inline_cleanups = Vec::new();
    for field in grouped_fields.all_inline() {
        if field.is_flag() {
            continue;
        }
        let field_name = &field.field_name;
        if field.drop_on_completion_if_immutable {
            inline_cleanups.push(quote! {
                if is_immutable {
                    typed.inline.#field_name = Default::default();
                } else {
                    typed.inline.#field_name.shrink_to_fit();
                }
            });
        } else if field.shrink_on_completion {
            inline_cleanups.push(quote! {
                typed.inline.#field_name.shrink_to_fit();
            });
        }
    }

    // Generate per-variant cleanup blocks for lazy fields with cleanup attrs.
    // Each block uses typed accessors so we don't depend on iterating
    // `&LazyField`.
    let mut lazy_cleanups = Vec::new();

    for field in grouped_fields.all_lazy() {
        if field.is_flag() {
            continue;
        }
        let shrink = field.shrink_on_completion;
        let drop_if_immutable = field.drop_on_completion_if_immutable;
        if !shrink && !drop_if_immutable {
            continue;
        }
        let is_collection = matches!(
            field.storage_type,
            StorageType::AutoSet | StorageType::AutoMap | StorageType::CounterMap
        );
        let take_name = field.take_ident();
        let get_mut_name = field.get_mut_ident();

        if drop_if_immutable && shrink && is_collection {
            // Drop for immutable, shrink-or-remove-if-empty for mutable.
            lazy_cleanups.push(quote! {
                if is_immutable {
                    let _ = typed.#take_name();
                } else if let Some(c) = typed.#get_mut_name() {
                    if c.is_empty() {
                        let _ = typed.#take_name();
                    } else {
                        c.shrink_to_fit();
                    }
                }
            });
        } else if shrink && is_collection {
            // Shrink or remove-if-empty, in place where possible.
            lazy_cleanups.push(quote! {
                if let Some(c) = typed.#get_mut_name() {
                    if c.is_empty() {
                        let _ = typed.#take_name();
                    } else {
                        c.shrink_to_fit();
                    }
                }
            });
        } else if drop_if_immutable {
            // Drop for immutable (works for both collection and direct values).
            lazy_cleanups.push(quote! {
                if is_immutable {
                    let _ = typed.#take_name();
                }
            });
        }
    }

    quote! {
        #[doc = "Clean up task storage after execution completes."]
        #[doc = ""]
        #[doc = "This method performs a single pass over lazy fields to:"]
        #[doc = "- Shrink collections marked with `shrink_on_completion`"]
        #[doc = "- Remove empty collections"]
        #[doc = "- Drop fields marked with `drop_on_completion_if_immutable` for immutable tasks"]
        #[doc = ""]
        #[doc = "This is more efficient than calling individual shrink_* methods, which would"]
        #[doc = "each scan the lazy vec separately (O(n²) vs O(n))."]
        #[doc = ""]
        #[doc = "Uses swap_remove pattern for O(1) removal (order not preserved)."]
        fn cleanup_after_execution(&mut self) {
            let typed = self.typed_mut();
            let is_immutable = typed.flags.immutable();

            // Clean up inline collection fields (always present, not in lazy area).
            #(#inline_cleanups)*

            // Per-variant cleanup for lazy fields with cleanup attributes.
            #(#lazy_cleanups)*

            typed.lazy_shrink_to_fit();
        }
    }
}

/// Generate the `drop_data()`, `drop_meta()`, and `drop_data_and_meta()` methods
/// for TaskStorageInner.
///
/// These methods clear persistent category fields for eviction. They must be
/// generated by the macro because they need to know which specific inline fields
/// belong to each category.
///
/// For `filter_transient` fields the generator emits a check-then-drop-or-retain
/// pattern: the overwhelmingly common case is that no transient entries are present,
/// and we want that to be a single linear `any()` scan followed by a cheap
/// `Default::default()` reset. If transient entries do exist, we `retain` them and
/// leave the field as residue — eviction proceeds (the persistent portion is
/// recoverable from disk) and `restore_*_from` will merge the persistent portion
/// back in later.
fn generate_drop_method(grouped_fields: &GroupedFields) -> TokenStream {
    let drop_data_inline: Vec<_> = grouped_fields
        .persistent_inline(Category::Data)
        .map(gen_drop_inline_field)
        .collect();
    let drop_meta_inline: Vec<_> = grouped_fields
        .persistent_inline(Category::Meta)
        .map(gen_drop_inline_field)
        .collect();

    // Per-variant drop blocks, unrolled so we don't iterate `&mut LazyField`.
    // Each block consults `data` / `meta` to decide whether to act, then either
    // removes the variant (non-filter_transient) or invokes `drop_partial()`
    // and reinstalls residue (filter_transient / custom_drop_partial).
    let drop_persistent_lazy_blocks: Vec<_> = grouped_fields
        .all_lazy()
        .filter(|f| !f.is_transient())
        .map(gen_drop_persistent_lazy_block)
        .collect();

    // Per-variant transient-empty cleanup, unrolled: drop the variant if it has
    // become empty (zombie state).
    let drop_transient_lazy_blocks: Vec<_> = grouped_fields
        .all_lazy()
        .filter(|f| f.is_transient())
        .map(gen_drop_transient_lazy_block)
        .collect();

    // Build per-category emptiness predicates. Each predicate inspects only
    // the inline fields, lazy variants, and flag bits that belong to its
    // category — which lets `drop_partial` skip re-checking the categories it
    // just dropped (those are known to be clean when `__has_residue=false`).
    fn category_inline_check(field: &FieldInfo) -> TokenStream {
        let field_name = &field.field_name;
        match field.storage_type {
            StorageType::AutoMap | StorageType::AutoSet | StorageType::CounterMap => quote! {
                self.inline.#field_name.is_empty()
            },
            StorageType::Direct => quote! {
                self.inline.#field_name == Default::default()
            },
            StorageType::Flag => unreachable!(),
        }
    }

    let inline_data_checks: Vec<_> = grouped_fields
        .all_inline()
        .filter(|f| f.category == Category::Data)
        .map(category_inline_check)
        .collect();
    let inline_meta_checks: Vec<_> = grouped_fields
        .all_inline()
        .filter(|f| f.category == Category::Meta)
        .map(category_inline_check)
        .collect();
    let inline_transient_checks: Vec<_> = grouped_fields
        .all_inline()
        .filter(|f| f.category == Category::Transient)
        .map(category_inline_check)
        .collect();

    quote! {
        #[automatically_derived]
        impl crate::backend::task_storage::TaskStorage {

            /// Whether this storage holds no data-category state — no
            /// data-category lazy variants, no data-category inline fields
            /// distinguishable from `Default`, and no persisted data flag
            /// bits. Used by `drop_partial` to short-circuit `is_empty()`
            /// after a meta-only or transient-only drop.
            ///
            /// Lives on `TaskStorage` (not `TaskStorageInner`) because the
            /// lazy-emptiness check reads payload bytes through a pointer
            /// derived from `self.ptr`, which carries provenance over the
            /// full head+tail allocation. A reference of type
            /// `&TaskStorageInner` would only have provenance for the head
            /// bytes — reading the tail through it is UB under Stacked
            /// Borrows.
            #[inline]
            pub(crate) fn is_empty_data(&self) -> bool {
                self.flags.persisted_data_bits() == 0
                    && self.all_lazy_data_empty_or_absent()
                    #(&& #inline_data_checks)*
            }

            /// Whether this storage holds no meta-category state. See
            /// [`Self::is_empty_data`].
            #[inline]
            pub(crate) fn is_empty_meta(&self) -> bool {
                self.flags.persisted_meta_bits() == 0
                    && self.all_lazy_meta_empty_or_absent()
                    #(&& #inline_meta_checks)*
            }

            /// Whether this storage holds no transient state. Transient state
            /// is never touched by `drop_partial`, so the eviction caller has
            /// to consult this independently of which categories were
            /// dropped.
            #[inline]
            pub(crate) fn is_empty_transient(&self) -> bool {
                // Transient flag bits are everything outside `PERSISTED_MASK`.
                (self.flags.bits() & !TaskFlags::PERSISTED_MASK) == 0
                    && self.all_transient_lazy_empty()
                    #(&& #inline_transient_checks)*
            }

            pub fn is_empty(&self) -> bool {
                self.is_empty_meta() && self.is_empty_data() && self.is_empty_transient()
            }
            /// Drop persistent fields so the task can be evicted.
            ///
            /// For each `filter_transient` field, transient entries are retained as
            /// residue (they cannot be reconstructed from disk); for all other
            /// persistent fields the field is reset to its default. Transient fields
            /// (non-persistent) are never touched.
            ///
            /// `data_restored` / `meta_restored` flags are cleared for the dropped
            /// categories so the next access triggers a restore. `prefetched` is
            /// cleared unconditionally.
            ///
            /// Authoritative on whether the task entry can be erased:
            /// - `Empty` ⇒ the task entry is fully empty (no residue from the
            ///   dropped categories, the OTHER category is empty too, and no
            ///   transient state remains). Caller can erase the bucket.
            /// - `HasResidue` ⇒ the task entry must stay in the map for some
            ///   reason: residue from this drop, the other category is still
            ///   populated, or transient state is set.
            ///
            /// The caller does NOT need to call `is_empty()` after this — the
            /// outcome already accounts for everything `is_empty()` would check.
            ///
            /// Lives on `TaskStorage` because it may install via
            /// `<name>_mut()` (filter_transient residue) which can grow the
            /// underlying buffer.
            #[must_use]
            pub fn drop_partial(
                &mut self,
                data: bool,
                meta: bool,
            ) -> DropPartialOutcome {
                debug_assert!(data || meta, "at least one of data and meta must be true");
                // OR'd to true by `gen_drop_inline_field` and
                // `gen_drop_lazy_match_arm` whenever a `filter_transient` field
                // reports `HasResidue`.
                let mut __has_residue = false;
                if data {
                    #(#drop_data_inline)*
                    // Clear persisted data flag bits so they don't keep an
                    // otherwise-evicted task looking non-empty. They come back
                    // via `set_persisted_data_bits` on restore.
                    self.flags.clear_persisted_data_bits();
                    self.flags.set_data_restored(false);
                }
                if meta {
                    #(#drop_meta_inline)*
                    self.flags.clear_persisted_meta_bits();
                    self.flags.set_meta_restored(false);
                }
                self.flags.set_prefetched(false);

                // Per-variant drop of persistent lazy fields whose category was
                // selected for drop. Filter-transient variants keep their
                // residue (and OR into `__has_residue`); others are removed.
                #(#drop_persistent_lazy_blocks)*

                // Sweep zombie transient variants — empty entries that
                // accumulate when cells are consumed without the task
                // re-running (so `shrink_on_completion` never fires). They
                // would otherwise block `is_empty()` from accepting the task
                // for full eviction.
                #(#drop_transient_lazy_blocks)*

                self.lazy_shrink_to_fit();
                if __has_residue {
                    // Some `filter_transient` field kept transient entries;
                    // the entry must stay regardless of what other state is
                    // present. Skip the per-category emptiness checks.
                    return DropPartialOutcome::HasResidue;
                }
                // No residue from this drop, so the requested categories are
                // fully clean. Consult only the categories we did NOT drop
                // (plus transient state, which `drop_partial` never touches).
                let meta_clean = meta || self.is_empty_meta();
                let data_clean = data || self.is_empty_data();
                if meta_clean && data_clean && self.is_empty_transient() {
                    DropPartialOutcome::Empty
                } else {
                    DropPartialOutcome::HasResidue
                }
            }

        }
    }
}

/// Generate the drop statement for a single persistent inline field.
///
/// For `filter_transient` fields: check for transient entries first and `retain`
/// them only if any exist, otherwise reset to default (hot path — single linear
/// scan, no per-element work on the happy path).
/// For non-filtered fields: unconditional `Default::default()` reset.
fn gen_drop_inline_field(field: &FieldInfo) -> TokenStream {
    let field_name = &field.field_name;
    if !field.filter_transient {
        return quote! {
            self.inline.#field_name = Default::default();
        };
    }
    let target = quote! { self.inline.#field_name };
    if let StorageType::Direct = field.storage_type {
        // For `Option<T>` fields, `DropPartial::drop_partial` clears the
        // `Option` to `None` for persistent values and leaves transient
        // values in place. OR the residue bit into the surrounding
        // `__has_residue` accumulator so the outer `drop_partial` can
        // short-circuit the post-drop `is_empty()` query when residue is
        // present.
        quote! {
            __has_residue |= (#target).drop_partial() == DropPartialOutcome::HasResidue;
        }
    } else {
        // When empty, we reset to `Default::default()` to release any over-allocated
        // capacity from the prior shape. When residue remains, we leave it in place
        // so transient entries (e.g. transient `upper` references to root tasks)
        // survive eviction. Restoration merges the persistent portion back in.
        quote! {
            match (#target).drop_partial() {
                DropPartialOutcome::Empty => {
                    #target = Default::default();
                }
                DropPartialOutcome::HasResidue => {
                    __has_residue = true;
                }
            }
        }
    }
}

/// Generate the per-variant block for a persistent lazy variant in
/// `drop_partial`.
///
/// Behavior:
/// - If the variant's category is not selected for drop (`data` / `meta` flags), the block is a
///   no-op.
/// - For `filter_transient` / `custom_drop_partial` variants: takes the variant, runs
///   `drop_partial()` on it, OR's the result into `__has_residue`, and reinstalls the value if
///   residue remains.
/// - For ordinary persistent variants: drops the variant entirely.
fn gen_drop_persistent_lazy_block(field: &FieldInfo) -> TokenStream {
    debug_assert!(!field.is_transient());
    let category_flag = match field.category {
        Category::Data => quote! { data },
        Category::Meta => quote! { meta },
        Category::Transient => unreachable!(),
    };
    let take_name = field.take_ident();

    if field.filter_transient || field.custom_drop_partial {
        // Collection-only path (the parser rejects filter_transient on
        // non-collection storage). `mut_name()` reinstalls residue while
        // creating an empty entry if absent — but residue is always non-empty
        // by the protocol below, so the empty-create path doesn't fire.
        let mut_name = field.mut_ident();
        quote! {
            if #category_flag {
                if let Some(mut v) = self.#take_name() {
                    let outcome = v.drop_partial();
                    if outcome == DropPartialOutcome::HasResidue {
                        __has_residue = true;
                        *self.#mut_name() = v;
                    }
                    // else: drop_partial consumed everything; nothing to reinstall.
                }
            }
        }
    } else {
        quote! {
            if #category_flag {
                let _ = self.#take_name();
            }
        }
    }
}

/// Generate the per-variant block for a transient lazy variant in
/// `drop_partial`. Drops the variant only if it is currently present and
/// empty — those zombie entries would otherwise block `is_empty()` from
/// accepting the task for full eviction.
///
/// Only collection types have a meaningful `is_empty` notion at the inner
/// type — direct lazy variants signal absence by simply not being present in
/// the lazy area at all, so they never become zombies.
fn gen_drop_transient_lazy_block(field: &FieldInfo) -> TokenStream {
    debug_assert!(field.is_transient());
    let is_collection = matches!(
        field.storage_type,
        StorageType::AutoSet | StorageType::AutoMap | StorageType::CounterMap
    );
    if !is_collection {
        return quote! {};
    }
    let take_name = field.take_ident();
    let getter = field.ref_ident();
    quote! {
        if self.#getter().is_some_and(|v| v.is_empty()) {
            let _ = self.#take_name();
        }
    }
}

/// Extract the inner type from Option<T>, or return the type as-is if not Option
fn extract_option_inner_type(ty: &Type) -> TokenStream {
    // Try to parse as Option<T> and extract T
    if let Type::Path(type_path) = ty
        && let Some(segment) = type_path.path.segments.last()
        && segment.ident == "Option"
        && let syn::PathArguments::AngleBracketed(args) = &segment.arguments
        && let Some(syn::GenericArgument::Type(inner)) = args.args.first()
    {
        return quote! { #inner };
    }

    // Not Option<T>, return the type as-is
    quote! { #ty }
}

/// Extract the element type K from AutoSet<K> (which is FxHashSet<K>)
fn extract_set_element_type(ty: &Type) -> Option<TokenStream> {
    if let Type::Path(type_path) = ty
        && let Some(segment) = type_path.path.segments.last()
        && (segment.ident == "AutoSet" || segment.ident == "FxHashSet")
        && let syn::PathArguments::AngleBracketed(args) = &segment.arguments
        && let Some(syn::GenericArgument::Type(inner)) = args.args.first()
    {
        return Some(quote! { #inner });
    }
    None
}

/// Extract key and value types from a map type (e.g., AutoMap<K, V> or CounterMap<K, V>)
fn extract_map_types(ty: &Type, expected_name: &str) -> Option<(TokenStream, TokenStream)> {
    let (key_type, value_type) = extract_map_types_raw(ty, expected_name)?;
    Some((quote! { #key_type }, quote! { #value_type }))
}

/// Extract key and value types from a map type, returning the raw Type references.
fn extract_map_types_raw<'a>(ty: &'a Type, expected_name: &str) -> Option<(&'a Type, &'a Type)> {
    if let Type::Path(type_path) = ty
        && let Some(segment) = type_path.path.segments.last()
        && segment.ident == expected_name
        && let syn::PathArguments::AngleBracketed(args) = &segment.arguments
    {
        let mut args_iter = args.args.iter();
        if let Some(syn::GenericArgument::Type(key_type)) = args_iter.next()
            && let Some(syn::GenericArgument::Type(value_type)) = args_iter.next()
        {
            return Some((key_type, value_type));
        }
    }
    None
}

/// Check if a type is specifically `i32`.
fn is_type_i32(ty: &Type) -> bool {
    is_primitive_type(ty, "i32")
}

/// Check if a type is specifically `u32`.
fn is_type_u32(ty: &Type) -> bool {
    is_primitive_type(ty, "u32")
}

/// Check if a type is a specific primitive type (e.g., "i32", "u32").
fn is_primitive_type(ty: &Type, name: &str) -> bool {
    if let Type::Path(type_path) = ty
        && type_path.qself.is_none()
        && type_path.path.segments.len() == 1
        && let Some(segment) = type_path.path.segments.first()
        && segment.ident == name
        && segment.arguments.is_none()
    {
        return true;
    }
    false
}

fn capitalize(s: &str) -> String {
    let mut c = s.chars();
    match c.next() {
        None => String::new(),
        Some(f) => f.to_uppercase().collect::<String>() + c.as_str(),
    }
}

/// Convert snake_case to PascalCase (e.g., "in_progress" -> "InProgress")
fn to_pascal_case(s: &str) -> String {
    s.split('_').map(capitalize).collect::<String>()
}

/// Generate encode body for a category (inline fields + lazy fields).
fn gen_encode_body(grouped_fields: &GroupedFields, category: Category) -> TokenStream {
    let inline: Vec<_> = grouped_fields
        .persistent_inline(category.clone())
        .map(generate_encode_inline_field)
        .collect();
    let lazy: Vec<_> = grouped_fields.persistent_lazy(category.clone()).collect();
    let lazy_encode = generate_encode_lazy_fields(category, &lazy);

    quote! {
        #(#inline)*
        #lazy_encode
    }
}

/// Generate decode body for a category (inline fields + lazy fields).
fn gen_decode_body(grouped_fields: &GroupedFields, category: Category) -> TokenStream {
    let inline: Vec<_> = grouped_fields
        .persistent_inline(category.clone())
        .map(|field| {
            let field_name = &field.field_name;
            quote! {
                self.inline.#field_name = bincode::Decode::decode(decoder)?;
            }
        })
        .collect();
    let lazy: Vec<_> = grouped_fields.persistent_lazy(category).collect();
    let lazy_decode = generate_decode_lazy_fields(&lazy);

    quote! {
        #(#inline)*
        #lazy_decode
    }
}

/// Generate encode/decode methods for TaskStorageInner serialization.
///
/// Generates four methods:
/// - `encode_meta<E>(&self, encoder: &mut E)` - Encode meta category fields
/// - `encode_data<E>(&self, encoder: &mut E)` - Encode data category fields
/// - `decode_meta<D>(&mut self, decoder: &mut D)` - Decode meta category fields
/// - `decode_data<D>(&mut self, decoder: &mut D)` - Decode data category fields
///
/// Only persistent (non-transient) fields are encoded/decoded.
/// Flags are encoded/decoded per-category using separate masks.
fn generate_encode_decode_methods(grouped_fields: &GroupedFields) -> TokenStream {
    let has_meta_flags = grouped_fields.persisted_meta_flags().next().is_some();
    let has_data_flags = grouped_fields.persisted_data_flags().next().is_some();

    let encode_meta_body = gen_encode_body(grouped_fields, Category::Meta);
    let encode_data_body = gen_encode_body(grouped_fields, Category::Data);
    let decode_meta_body = gen_decode_body(grouped_fields, Category::Meta);
    let decode_data_body = gen_decode_body(grouped_fields, Category::Data);

    let encode_meta_flags = if has_meta_flags {
        quote! {
            // Encode only the persisted meta flag bits
            let meta_flags = self.flags.persisted_meta_bits();
            bincode::Encode::encode(&meta_flags, encoder)?;
        }
    } else {
        quote! {}
    };

    let encode_data_flags = if has_data_flags {
        quote! {
            // Encode only the persisted data flag bits
            let data_flags = self.flags.persisted_data_bits();
            bincode::Encode::encode(&data_flags, encoder)?;
        }
    } else {
        quote! {}
    };

    let decode_meta_flags = if has_meta_flags {
        quote! {
            // Decode only the persisted meta flag bits, preserving other flags
            self.flags.set_persisted_meta_bits(bincode::Decode::decode(decoder)?);
        }
    } else {
        quote! {}
    };

    let decode_data_flags = if has_data_flags {
        quote! {
            // Decode only the persisted data flag bits, preserving other flags
            self.flags.set_persisted_data_bits(bincode::Decode::decode(decoder)?);
        }
    } else {
        quote! {}
    };

    quote! {
        #[automatically_derived]
        impl crate::backend::task_storage::TaskStorage {
            /// Encode meta category fields directly to bincode.
            /// Only persistent (non-transient) fields are encoded.
            ///
            /// Lives on `TaskStorage` (not `TaskStorageInner`) because it
            /// reads lazy collection payloads via accessors that derive the
            /// tail pointer from the owning thin pointer's full-allocation
            /// provenance.
            pub fn encode_meta<E: bincode::enc::Encoder>(
                &self,
                encoder: &mut E,
            ) -> Result<(), bincode::error::EncodeError> {
                #encode_meta_body
                #encode_meta_flags
                Ok(())
            }

            /// Encode data category fields directly to bincode.
            /// Only persistent (non-transient) fields are encoded.
            ///
            /// Lives on `TaskStorage` for the same reason as `encode_meta`.
            pub fn encode_data<E: bincode::enc::Encoder>(
                &self,
                encoder: &mut E,
            ) -> Result<(), bincode::error::EncodeError> {
                #encode_data_body
                #encode_data_flags
                Ok(())
            }

            /// Decode meta category fields from bincode. Only persistent
            /// (non-transient) fields are decoded.
            ///
            /// Lives on `TaskStorage` because installing lazy payloads
            /// from the wire may need to grow the unified buffer.
            pub fn decode_meta<D: bincode::de::Decoder>(
                &mut self,
                decoder: &mut D,
            ) -> Result<(), bincode::error::DecodeError> {
                #decode_meta_body
                #decode_meta_flags
                Ok(())
            }

            /// Decode data category fields from bincode. Only persistent
            /// (non-transient) fields are decoded.
            pub fn decode_data<D: bincode::de::Decoder>(
                &mut self,
                decoder: &mut D,
            ) -> Result<(), bincode::error::DecodeError> {
                #decode_data_body
                #decode_data_flags
                Ok(())
            }
        }
    }
}

// =============================================================================
// Transient Filtering Helpers
// =============================================================================

/// Filter predicate type for transient filtering.
///
/// Describes what type of value the filter applies to:
/// - `Option`: filter predicate for Option inner value
/// - `Set`: filter predicate for set elements
/// - `Map`: filter predicate for map entries (key, value)
/// - `CounterMap`: filter predicate for counter map entries (key only)
#[derive(Clone, Copy)]
enum FilterPredicateType {
    Option,
    Set,
    Map,
    CounterMap,
}

/// Generate the filter predicate closure for a field.
///
/// Returns the predicate expression (e.g., `|k| !k.is_transient()`) and the predicate type.
/// Returns `None` if no filtering is needed.
fn generate_filter_predicate(field: &FieldInfo) -> Option<(TokenStream, FilterPredicateType)> {
    if !field.filter_transient {
        return None;
    }

    match field.storage_type {
        StorageType::Direct => Some((
            quote! { |v| !v.is_transient() },
            FilterPredicateType::Option,
        )),
        StorageType::AutoSet => Some((quote! { |k| !k.is_transient() }, FilterPredicateType::Set)),
        StorageType::CounterMap => Some((
            quote! { |(k, _)| !k.is_transient() },
            FilterPredicateType::CounterMap,
        )),
        StorageType::AutoMap => Some((
            quote! { |(k, v)| !k.is_transient() && !v.is_transient() },
            FilterPredicateType::Map,
        )),
        StorageType::Flag => {
            // Flags are encoded in TaskFlags bitfield, not individually
            unreachable!("Flag fields should not reach generate_filter_predicate")
        }
    }
}

/// Generate code to encode a value with transient filtering based on field configuration.
///
/// This is a shared helper used by both inline field encoding and lazy field encoding.
/// The `value_ref` parameter is an expression that evaluates to a *reference* to the value
/// (e.g., `&self.field_name` for inline fields, or `data` for lazy fields where `data`
/// is already a reference from the match arm).
///
/// For non-filtered fields, encodes the value directly.
///
/// For filtered fields, we materialize a *same-typed* container with the
/// filtered entries and encode that container through its own
/// `bincode::Encode` impl. That way the encode wire shape is whatever the
/// container's own `Encode` produces — and the decode side's
/// `bincode::Decode::decode(decoder)?` reads the matching shape. Earlier
/// versions emitted a hand-rolled `len + element*` format, which only
/// happened to match the container's `Encode` impl by coincidence — a
/// container that later switched to a tagged wire form (struct prefix,
/// custom varint) would silently produce unparsable bytes here.
fn generate_encode_value(field: &FieldInfo, value_ref: TokenStream) -> TokenStream {
    let Some((predicate, pred_type)) = generate_filter_predicate(field) else {
        // No filtering needed, just encode normally
        return quote! {
            bincode::Encode::encode(#value_ref, encoder)?;
        };
    };

    let field_type = &field.field_type;
    match pred_type {
        FilterPredicateType::Option => {
            // For Option<T>, check if the value is transient and encode None if so.
            // bincode encodes `Option<&T>` and `Option<T>` with the same
            // wire shape, so the decode side reads back into `Option<T>`.
            quote! {
                {
                    let filtered_value = (#value_ref).as_ref().filter(#predicate);
                    bincode::Encode::encode(&filtered_value, encoder)?;
                }
            }
        }
        FilterPredicateType::Set => {
            // Build a fresh same-typed set with the filtered entries, then
            // delegate to its bincode `Encode` impl — guaranteeing the
            // encode/decode wire shapes match by construction.
            quote! {
                {
                    let mut filtered: #field_type = Default::default();
                    filtered.extend(
                        (#value_ref).iter().filter(#predicate).cloned()
                    );
                    bincode::Encode::encode(&filtered, encoder)?;
                }
            }
        }
        FilterPredicateType::CounterMap | FilterPredicateType::Map => {
            // Same pattern as Set: materialize a same-typed container of
            // the filtered (key, value) pairs and delegate to its bincode
            // `Encode` impl.
            quote! {
                {
                    let mut filtered: #field_type = Default::default();
                    filtered.extend(
                        (#value_ref)
                            .iter()
                            .filter(#predicate)
                            .map(|(k, v)| (k.clone(), v.clone()))
                    );
                    bincode::Encode::encode(&filtered, encoder)?;
                }
            }
        }
    }
}

/// Generate code to encode an inline field to bincode.
///
/// Delegates to `generate_encode_value` with `&self.inline.field_name` as the value reference.
fn generate_encode_inline_field(field: &FieldInfo) -> TokenStream {
    let field_name = &field.field_name;
    generate_encode_value(field, quote! { &self.inline.#field_name })
}

/// Generate code to encode lazy fields to bincode.
///
/// Wire format: `(present: u32) (payload)*` — the bitmap covers
/// this category's lazy variants (`present & LAZY_<CAT>_MASK`),
/// payloads follow in ascending tag order. No per-payload index byte
/// and no sentinel: the bitmap uniquely identifies each payload by
/// position.
///
/// Compared to the old `(idx, data)...0` format this saves one byte per
/// present payload (the index) plus the trailing sentinel, and — more
/// importantly — lets the decode side preallocate the exact tail
/// capacity up front via `with_tail_capacity(sum_padded_sizes(present))`,
/// turning N grows-during-decode into one allocation.
///
/// For `filter_transient` fields we build the filtered container into a
/// local up front; if it ends up empty the bit is cleared from the
/// emitted bitmap (preserving the "absent vs present-and-empty"
/// distinction the old encoder maintained). Non-filtered fields always
/// emit when present.
fn generate_encode_lazy_fields(category: Category, fields: &[&FieldInfo]) -> TokenStream {
    if fields.is_empty() {
        return quote! {};
    }

    let category_mask_ident = match category {
        Category::Meta => quote! { LAZY_META_MASK },
        Category::Data => quote! { LAZY_DATA_MASK },
        Category::Transient => {
            // Transient lazy fields are never serialized.
            unreachable!("generate_encode_lazy_fields called for Transient category");
        }
    };

    // Per-field locals: each filter_transient field gets a
    // `Option<#field_type>` holding the prebuilt filtered container,
    // which we encode in the second pass once the bitmap is written.
    // Non-filter fields don't need a local — the second pass re-reads
    // them from the tail through their tag pointer.
    let mut buffer_decls = Vec::new();
    let mut filter_arms = Vec::new();
    let mut emit_arms = Vec::new();
    for field in fields {
        let field_type = &field.field_type;
        let tag_ident = field.tag_ident();
        let buf_ident = syn::Ident::new(
            &format!("__lazy_buf_{}", field.field_name),
            proc_macro2::Span::call_site(),
        );

        if field.filter_transient {
            // Stash the filter predicate; the same machinery as the
            // inline `generate_encode_value` path constructs the
            // same-typed container with filtered entries.
            let (predicate, pred_type) = generate_filter_predicate(field)
                .expect("filter_transient field must produce a filter predicate");
            // Direct lazy fields are rejected at parse time when
            // combined with filter_transient (we only support
            // collection storage here), so we don't need an Option arm.
            let build_filtered = match pred_type {
                FilterPredicateType::Set => quote! {
                    let mut f: #field_type = Default::default();
                    f.extend(data.iter().filter(#predicate).cloned());
                    f
                },
                FilterPredicateType::CounterMap | FilterPredicateType::Map => quote! {
                    let mut f: #field_type = Default::default();
                    f.extend(
                        data.iter()
                            .filter(#predicate)
                            .map(|(k, v)| (k.clone(), v.clone()))
                    );
                    f
                },
                FilterPredicateType::Option => {
                    // filter_transient on Option-shaped fields means
                    // `output: Option<OutputValue>` (inline), which never
                    // goes through this path — inline fields are encoded
                    // by `generate_encode_inline_field`, not here.
                    unreachable!(
                        "filter_transient + Option predicate on lazy collection field is \
                         impossible per the parser's constraints"
                    );
                }
            };

            buffer_decls.push(quote! {
                let mut #buf_ident: Option<#field_type> = None;
            });
            filter_arms.push(quote! {
                t if t == #tag_ident.raw() => {
                    // SAFETY: `tag` is `#tag_ident`, whose schema-declared
                    // payload type is `#field_type`.
                    let data: &#field_type = unsafe { &*ptr.cast::<#field_type>() };
                    let filtered = { #build_filtered };
                    if !filtered.is_empty() {
                        encoded_bits |= #tag_ident.bit();
                        #buf_ident = Some(filtered);
                    }
                }
            });
            emit_arms.push(quote! {
                t if t == #tag_ident.raw() => {
                    // SAFETY: filter pass set this bit only when
                    // `#buf_ident` is `Some(filtered)`.
                    let value = unsafe { #buf_ident.as_ref().unwrap_unchecked() };
                    bincode::Encode::encode(value, encoder)?;
                }
            });
        } else {
            // Non-filtered: always emit when present in the source.
            filter_arms.push(quote! {
                t if t == #tag_ident.raw() => {
                    encoded_bits |= #tag_ident.bit();
                }
            });
            emit_arms.push(quote! {
                t if t == #tag_ident.raw() => {
                    // SAFETY: `tag` is `#tag_ident`, whose schema-declared
                    // payload type is `#field_type`. The bit is set in
                    // `encoded_bits` (we wrote it during the filter pass)
                    // iff the tail also holds the payload, so the
                    // `lazy_tail.find` lookup must succeed.
                    let data: &#field_type = unsafe {
                        self.lazy_find(#tag_ident).unwrap_unchecked()
                    };
                    bincode::Encode::encode(data, encoder)?;
                }
            });
        }
    }

    quote! {
        // First pass: walk the tail, build filter buffers for
        // filter_transient fields, decide which bits to emit.
        //
        // SAFETY: `tail_base` is derived from the owning `TaskStorage`'s
        // `NonNull<TaskStorageInner>`, which has provenance over the full
        // head+tail allocation. Each arm matches on a tag whose payload
        // type is fixed by the schema.
        let mut encoded_bits: u32 = 0;
        #(#buffer_decls)*
        let tail_base = self.tail_ptr();
        unsafe {
            self.lazy_tail.for_each_present(tail_base, |tag, ptr| {
                if (tag.bit() & #category_mask_ident) == 0 {
                    return;
                }
                match tag.raw() {
                    #(#filter_arms)*
                    _ => {
                        debug_assert!(false, "tag {} not in this category mask", tag.raw());
                    }
                }
            });
        }
        // Second pass: write the bitmap, then payloads in ascending
        // tag order. We re-walk `encoded_bits` rather than the original
        // `present` so we skip filter_transient fields whose filtered
        // form is empty.
        bincode::Encode::encode(&encoded_bits, encoder)?;
        let mut bits = encoded_bits;
        while bits != 0 {
            let bit_idx = bits.trailing_zeros();
            let tag_raw = bit_idx as u8;
            match tag_raw {
                #(#emit_arms)*
                _ => {
                    debug_assert!(false, "encoded_bits {tag_raw:?} has no emit arm");
                }
            }
            bits &= bits - 1;
        }
    }
}

/// Generate code to decode lazy fields from bincode.
///
/// Wire format mirror of `generate_encode_lazy_fields`: read a `u32`
/// bitmap, then a payload per set bit in ascending tag order. Computes
/// the total padded tail size up front and pre-grows the buffer so
/// every payload installs without triggering a per-field realloc.
fn generate_decode_lazy_fields(fields: &[&FieldInfo]) -> TokenStream {
    if fields.is_empty() {
        return quote! {};
    }

    // One match arm per persistent lazy field in this category. We
    // dispatch by the global tag (`#global_tag_ident.raw()`),
    // which matches what the encoder wrote into the bitmap.
    let decode_arms: Vec<_> = fields
        .iter()
        .map(|field| {
            let field_type = &field.field_type;
            let global_tag_ident = field.tag_ident();
            quote! {
                t if t == #global_tag_ident.raw() => {
                    let payload: #field_type = bincode::Decode::decode(decoder)?;
                    // SAFETY: payload type is inferred from
                    // `#global_tag_ident`'s `Tag` parameter; the
                    // schema's tag→type mapping is enforced by the type
                    // system. The bitmap ensures each tag is decoded
                    // at most once.
                    unsafe { self.lazy_insert(#global_tag_ident, payload) };
                }
            }
        })
        .collect();

    // Build a per-category mask so we can reject bits set outside this
    // category (which would indicate a corrupted on-disk record from a
    // version skew).
    let category_bits: Vec<_> = fields
        .iter()
        .map(|field| {
            let tag_ident = field.tag_ident();
            quote! { #tag_ident.bit() }
        })
        .collect();

    quote! {
        let encoded_bits: u32 = bincode::Decode::decode(decoder)?;
        let valid_mask: u32 = 0u32#(| #category_bits)*;
        if encoded_bits & !valid_mask != 0 {
            return Err(bincode::error::DecodeError::OtherString(
                format!(
                    "lazy bitmap has bits outside this category's mask (bits=0x{:08x}, mask=0x{:08x})",
                    encoded_bits, valid_mask,
                ),
            ));
        }
        // Pre-grow the tail so every payload installs without a realloc.
        // `sum_padded_sizes` walks set bits with the same Lemire trick
        // the encoder uses, so the size is exact (not an over-estimate).
        let extra_tail_bytes = crate::backend::lazy_tail::LazyTail::sum_padded_sizes_for_bits(
            encoded_bits,
        );
        let already_used = self.lazy_tail.len as usize;
        let needed = already_used + extra_tail_bytes;
        if needed > self.lazy_tail.cap as usize {
            // SAFETY: `grow_to` reallocates the buffer to fit `needed`
            // tail bytes; subsequent `lazy_insert`s won't grow again.
            unsafe { self.grow_to_for_decode(needed) };
        }
        let mut bits = encoded_bits;
        while bits != 0 {
            let bit_idx = bits.trailing_zeros();
            let tag_raw = bit_idx as u8;
            match tag_raw {
                #(#decode_arms)*
                _ => {
                    return Err(bincode::error::DecodeError::OtherString(
                        format!("unknown lazy tag: {tag_raw}"),
                    ));
                }
            }
            bits &= bits - 1;
        }
    }
}

/// Generate clone inline statements for a category.
fn gen_clone_inline_for_category(
    grouped_fields: &GroupedFields,
    category: Category,
) -> Vec<TokenStream> {
    gen_clone_inline_fields(grouped_fields.persistent_inline(category))
}

/// Generate per-variant clone blocks for a category.
///
/// Emits one `if let Some(data) = self.<getter>() { snapshot.lazy_push(...) }`
/// block per persistent lazy field in the category. Unrolled so the codegen
/// never depends on iteration over `&LazyField` references.
fn gen_clone_lazy_arms_for_category(
    grouped_fields: &GroupedFields,
    category: Category,
) -> Vec<TokenStream> {
    grouped_fields
        .persistent_lazy(category)
        .map(|field| {
            let tag_ident = field.tag_ident();
            let getter = match field.storage_type {
                StorageType::Direct => field.get_ident(),
                _ => field.ref_ident(),
            };
            // SAFETY: `#tag_ident` carries the payload type, and
            // `snapshot` was just constructed with an empty lazy area, so
            // no entry exists for `#tag_ident` yet.
            quote! {
                if let Some(data) = self.#getter() {
                    unsafe { snapshot.lazy_insert(#tag_ident, data.clone()) };
                }
            }
        })
        .collect()
}

/// Generate per-variant restore blocks for a category.
///
/// Emits one block per persistent lazy variant. Each block takes the variant
/// from `source` (if present) and merges into `self`:
///
/// - For `filter_transient` / `custom_drop_partial` variants (always collection types), `self` may
///   hold transient residue that we must merge with the incoming value via `T::merge_restore`.
/// - For all other variants, the protocol guarantees `self` has no residue and we install the value
///   directly. A debug_assert verifies the absence invariant first.
fn gen_restore_lazy_blocks<'a>(fields: impl Iterator<Item = &'a FieldInfo>) -> Vec<TokenStream> {
    fields
        .map(|field| {
            let take_name = field.take_ident();
            let field_name_str = field.field_name.to_string();
            if field.filter_transient || field.custom_drop_partial {
                // Collection-only path. `mut_name()` creates an empty entry if
                // absent and returns `&mut T`; `T::merge_restore` folds the
                // incoming value into the existing residue (or the
                // freshly-created empty default).
                let mut_name = field.mut_ident();
                quote! {
                    if let Some(incoming) = source.#take_name() {
                        self.#mut_name().merge_restore(incoming);
                    }
                }
            } else {
                // Install the incoming value. Direct lazy fields expose
                // `set_<name>(value) -> Option<T>`; collection lazy fields only
                // expose `<name>_mut() -> &mut T` (with implicit allocation),
                // so we route through the right one per storage type.
                //
                // The "self has no residue" invariant is checked with a
                // non-mutating accessor. Earlier versions used
                // `self.#take_name().is_none()` which would silently consume
                // the existing value in debug builds and panic, leaving
                // release and debug builds with divergent post-violation
                // state. Now both builds agree: the assert reads, then the
                // install overwrites.
                let (presence_check, install) = match field.storage_type {
                    StorageType::Direct => {
                        let set_name = field.set_ident();
                        let get_name = field.get_ident();
                        (
                            quote! { self.#get_name().is_none() },
                            quote! { let _: Option<_> = self.#set_name(incoming); },
                        )
                    }
                    _ => {
                        let ref_name = field.ref_ident();
                        let mut_name = field.mut_ident();
                        (
                            quote! { self.#ref_name().is_none() },
                            quote! { *self.#mut_name() = incoming; },
                        )
                    }
                };
                quote! {
                    if let Some(incoming) = source.#take_name() {
                        debug_assert!(
                            #presence_check,
                            "restore_*_from called on storage that already has persistent lazy field {}",
                            #field_name_str,
                        );
                        #install
                    }
                }
            }
        })
        .collect()
}

/// Generate restore inline statements for a category.
fn gen_restore_inline_for_category(
    grouped_fields: &GroupedFields,
    category: Category,
) -> Vec<TokenStream> {
    grouped_fields
        .persistent_inline(category)
        .map(gen_restore_inline_field)
        .collect()
}

/// Generate snapshot clone and restore methods for TaskStorageInner.
///
/// Generates:
/// - `clone_meta_snapshot(&self) -> TaskStorageInner` - Clone only persistent meta fields
/// - `clone_data_snapshot(&self) -> TaskStorageInner` - Clone only persistent data fields
/// - `restore_from(&mut self, source, category)` - Restore data by category from decoded storage
/// - `restore_meta_from(&mut self, source)` - Restore meta fields from source
/// - `restore_data_from(&mut self, source)` - Restore data fields from source
/// - `restore_all_from(&mut self, source)` - Restore all fields from source
fn generate_snapshot_restore_methods(grouped_fields: &GroupedFields) -> TokenStream {
    let has_meta_flags = grouped_fields.persisted_meta_flags().next().is_some();
    let has_data_flags = grouped_fields.persisted_data_flags().next().is_some();
    let has_any_flags = has_meta_flags || has_data_flags;

    // Generate field operations by category
    let clone_meta_inline = gen_clone_inline_for_category(grouped_fields, Category::Meta);
    let clone_data_inline = gen_clone_inline_for_category(grouped_fields, Category::Data);
    let clone_meta_lazy_arms = gen_clone_lazy_arms_for_category(grouped_fields, Category::Meta);
    let clone_data_lazy_arms = gen_clone_lazy_arms_for_category(grouped_fields, Category::Data);

    let restore_meta_inline = gen_restore_inline_for_category(grouped_fields, Category::Meta);
    let restore_data_inline = gen_restore_inline_for_category(grouped_fields, Category::Data);

    // Per-variant restore blocks for each persistent meta/data variant.
    // Each block tries to take the variant from `source` and either merges it
    // with `self`'s residue (filter_transient) or moves it in.
    let restore_meta_lazy_blocks =
        gen_restore_lazy_blocks(grouped_fields.persistent_lazy(Category::Meta));
    let restore_data_lazy_blocks =
        gen_restore_lazy_blocks(grouped_fields.persistent_lazy(Category::Data));

    let clone_all_flags = if has_any_flags {
        quote! {
            // Clone all persisted flags
            snapshot.flags.set_persisted_bits(self.flags.persisted_bits());
        }
    } else {
        quote! {}
    };

    // Generate flags handling for restore - per category
    let restore_meta_flags = if has_meta_flags {
        quote! {
            // Restore persisted meta flags (preserve other flags)
            self.flags.set_persisted_meta_bits(source.flags.persisted_meta_bits());
        }
    } else {
        quote! {}
    };

    let restore_data_flags = if has_data_flags {
        quote! {
            // Restore persisted data flags (preserve other flags)
            self.flags.set_persisted_data_bits(source.flags.persisted_data_bits());
        }
    } else {
        quote! {}
    };

    quote! {
        #[automatically_derived]
        impl crate::backend::task_storage::TaskStorage {
            /// Create a snapshot containing all persistent fields. Returns a
            /// fresh `TaskStorage`; the snapshot is independent of `self`.
            ///
            /// Lives on `TaskStorage` (not `TaskStorageInner`) because cloning
            /// the lazy payloads into the new snapshot installs them, which
            /// may need to grow that snapshot's buffer.
            pub fn clone_snapshot(&self) -> crate::backend::task_storage::TaskStorage {
                let mut snapshot = crate::backend::task_storage::TaskStorage::new();

                // Clone inline meta fields
                #(#clone_meta_inline)*

                // Clone inline data fields
                #(#clone_data_inline)*

                #clone_all_flags

                // Clone all persistent lazy fields (both meta and data),
                // unrolled per variant. Each block is a single bit/index check
                // plus the clone+push when present.
                #(#clone_data_lazy_arms)*
                #(#clone_meta_lazy_arms)*

                snapshot
            }

            /// Restore persisted data from a decoded `TaskStorage`.
            ///
            /// This is used during restore operations to copy decoded persisted data
            /// into the task's existing storage. It preserves transient state (flags,
            /// transient fields) while restoring the persisted data.
            ///
            /// # Invariant
            ///
            /// This method assumes the target does NOT already have the persistent fields
            /// being restored. This is guaranteed by the restore protocol which only calls
            /// this once per category when the task is first accessed. Debug assertions
            /// verify this invariant.
            ///
            /// The `category` parameter specifies which category of data to restore:
            /// - `Meta`: Restore meta fields (aggregation_number, output, upper, dirty, etc.)
            /// - `Data`: Restore data fields (output_dependent, dependencies, cell_data, etc.)
            pub fn restore_from(
                &mut self,
                source: crate::backend::task_storage::TaskStorage,
                category: crate::backend::SpecificTaskDataCategory,
            ) {
                match category {
                    crate::backend::SpecificTaskDataCategory::Meta => self.restore_meta_from(source),
                    crate::backend::SpecificTaskDataCategory::Data => self.restore_data_from(source),
                }
            }

            /// Restore meta category fields from source.
            ///
            /// `self` may contain transient residue left behind by `drop_partial`;
            /// `filter_transient` fields are merged rather than overwritten.
            pub fn restore_meta_from(
                &mut self,
                mut source: crate::backend::task_storage::TaskStorage,
            ) {
                // Per-variant restore for each persistent meta lazy field.
                // Must run before the inline-field assignments below, because
                // those moves leave `source` partially moved and we wouldn't be
                // able to call `source.take_<variant>()` (which needs
                // `&mut source`) afterward.
                #(#restore_meta_lazy_blocks)*

                // Inline meta fields
                #(#restore_meta_inline)*

                #restore_meta_flags
            }

            /// Restore data category fields from source.
            ///
            /// `self` may contain transient residue left behind by `drop_partial`;
            /// `filter_transient` fields are merged rather than overwritten.
            pub fn restore_data_from(
                &mut self,
                mut source: crate::backend::task_storage::TaskStorage,
            ) {
                // Per-variant restore for each persistent data lazy field
                // (see restore_meta_from for the ordering rationale).
                #(#restore_data_lazy_blocks)*

                // Inline data fields
                #(#restore_data_inline)*

                #restore_data_flags
            }
        }
    }
}
