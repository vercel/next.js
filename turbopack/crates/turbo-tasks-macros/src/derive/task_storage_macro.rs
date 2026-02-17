use proc_macro2::TokenStream;
use quote::quote;
use syn::{
    Fields, Ident, ItemStruct, Meta, Token, Type, Visibility, punctuated::Punctuated,
    spanned::Spanned,
};

/// Derives the TaskStorage trait and generates optimized storage structures.
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
    /// If false (marked with `inline`), field is stored directly on TaskStorage.
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
    /// Delegates to TaskStorage accessor methods:
    /// - For inline fields: `self.typed().{field_name}()` yields `&T`
    /// - For lazy fields: `self.typed().{field_name}()` yields `Option<&T>`
    ///
    /// Note: This is for collection types (AutoSet, CounterMap, AutoMap), not Direct fields.
    fn collection_ref_expr(&self) -> TokenStream {
        let field_name = &self.field_name;
        // Both inline and lazy have accessor methods generated on TaskStorage
        quote! { self.typed().#field_name() }
    }

    /// Generate expression for mutable collection access (allocates for lazy fields).
    ///
    /// Delegates to TaskStorage accessor methods:
    /// - For inline fields: `self.typed_mut().{field_name}_mut()` yields `&mut T`
    /// - For lazy fields: `self.typed_mut().{field_name}_mut()` yields `&mut T` (allocates if
    ///   needed)
    ///
    /// Note: This is for collection types (AutoSet, CounterMap, AutoMap), not Direct fields.
    fn collection_mut_expr(&self) -> TokenStream {
        let field_name_mut = self.mut_ident();
        // Both inline and lazy have accessor methods generated on TaskStorage
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
    /// Delegates to TaskStorage accessor method `get_{field}()`.
    fn direct_get_expr(&self) -> TokenStream {
        let get_name = self.get_ident();
        quote! { self.typed().#get_name() }
    }

    /// Generate expression to set a Direct field value.
    ///
    /// Delegates to TaskStorage accessor method `set_{field}(value)`.
    /// For inline: returns `Option<T>` (old value)
    /// For lazy: returns `()` (no return value from current impl)
    fn direct_set_expr(&self) -> TokenStream {
        let set_name = self.set_ident();
        quote! { self.typed_mut().#set_name }
    }

    /// Generate expression to take a Direct field value.
    ///
    /// Delegates to TaskStorage accessor method `take_{field}()`.
    fn direct_take_expr(&self) -> TokenStream {
        let take_name = self.take_ident();
        quote! { self.typed_mut().#take_name() }
    }

    /// Generate expression to get a mutable reference to a Direct field value.
    ///
    /// Delegates to TaskStorage accessor method `get_{field}_mut()`.
    /// Only available for lazy Direct fields (inline fields can use set/take).
    fn direct_get_mut_expr(&self) -> TokenStream {
        let get_mut_name = self.get_mut_ident();
        quote! { self.typed_mut().#get_mut_name() }
    }

    // =========================================================================
    // TaskStorage Internal Access Helpers
    // These generate expressions for use within TaskStorage impl blocks,
    // operating on `self` directly rather than `self.typed()`.
    // =========================================================================

    /// Generate the find_lazy extractor closure for this lazy field.
    ///
    /// Returns `|f| match f { LazyField::Variant(v) => Some(v), _ => None }`
    fn lazy_extractor_closure(&self) -> TokenStream {
        let variant_name = &self.variant_name;
        quote! {
            |f| match f {
                LazyField::#variant_name(v) => Some(v),
                _ => None,
            }
        }
    }

    /// Generate the lazy field constructor expression.
    ///
    /// Returns `LazyField::Variant(value)` or `LazyField::Variant(Default::default())`
    fn lazy_constructor(&self, value_expr: TokenStream) -> TokenStream {
        let variant_name = &self.variant_name;
        quote! { LazyField::#variant_name(#value_expr) }
    }

    /// Generate a matches closure for get_or_create_lazy.
    ///
    /// Returns `|f| matches!(f, LazyField::Variant(_))`
    fn lazy_matches_closure(&self) -> TokenStream {
        let variant_name = &self.variant_name;
        quote! {
            |f| matches!(f, LazyField::#variant_name(_))
        }
    }

    /// Generate an unwrap closure that extracts the inner value from a LazyField variant.
    ///
    /// Returns `|f| match f { LazyField::Variant(v) => v, _ => unreachable!() }`
    ///
    /// Works for both borrowed and owned contexts (get_or_create_lazy, take_lazy, set_lazy).
    fn lazy_unwrap_closure(&self) -> TokenStream {
        let variant_name = &self.variant_name;
        quote! {
            |f| match f {
                LazyField::#variant_name(v) => v,
                _ => unreachable!(),
            }
        }
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
                        other => {
                            meta.span()
                                .unwrap()
                                .error(format!(
                                    "unknown attribute `{other}`, expected `storage` or `category`"
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
                    } else {
                        meta.span()
                            .unwrap()
                            .error(format!(
                                "unknown modifier `{ident}`, expected `inline`, \
                                 `filter_transient`, `default`, `shrink_on_completion`, or \
                                 `drop_on_completion_if_immutable`"
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
    fn all_lazy(&self) -> impl Iterator<Item = &FieldInfo> {
        self.fields.iter().filter(|f| !f.is_flag() && f.lazy)
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

/// Generate inline field clone assignments: `snapshot.field = self.field.clone();`
fn gen_clone_inline_fields<'a>(fields: impl Iterator<Item = &'a FieldInfo>) -> Vec<TokenStream> {
    fields
        .map(|field| {
            let field_name = &field.field_name;
            quote! {
                snapshot.#field_name = self.#field_name.clone();
            }
        })
        .collect()
}

/// Generate inline field restore assignments: `self.field = source.field;`
fn gen_restore_inline_fields<'a>(fields: impl Iterator<Item = &'a FieldInfo>) -> Vec<TokenStream> {
    fields
        .map(|field| {
            let field_name = &field.field_name;
            quote! {
                self.#field_name = source.#field_name;
            }
        })
        .collect()
}

/// Generate lazy field match arms with a custom body that also receives the index.
/// `LazyField::Variant(data) => { <body> }`
///
/// The `body_fn` receives the index and field, returning the body TokenStream.
/// The body can use `data` to reference the matched value.
fn gen_lazy_match_arms<'a>(
    fields: impl Iterator<Item = &'a FieldInfo>,
    body_fn: impl Fn(usize, &FieldInfo) -> TokenStream,
) -> Vec<TokenStream> {
    fields
        .enumerate()
        .map(|(idx, field)| {
            let variant_name = &field.variant_name;
            let body = body_fn(idx, field);
            quote! {
                LazyField::#variant_name(data) => {
                    #body
                }
            }
        })
        .collect()
}

fn generate_task_storage_impl(_ident: &Ident, grouped_fields: &GroupedFields) -> TokenStream {
    // Generate TaskFlags bitfield if there are flag fields
    let task_flags_bitfield = generate_task_flags_bitfield(grouped_fields);

    // Generate LazyField enum for lazy fields
    let lazy_field_enum = generate_lazy_field_enum(grouped_fields);

    // Generate the unified TaskStorage struct
    let typed_storage_struct = generate_typed_storage_struct(grouped_fields);

    // Generate accessor methods
    let accessor_methods = generate_accessor_methods(grouped_fields);

    // Generate TaskStorageAccessors trait for all fields
    let accessors_trait = generate_task_storage_accessors_trait(grouped_fields);

    // Generate encode/decode methods for serialization
    let encode_decode_methods = generate_encode_decode_methods(grouped_fields);

    // Generate snapshot clone and restore methods
    let snapshot_restore_methods = generate_snapshot_restore_methods(grouped_fields);

    quote! {
        // Import ShrinkToFit trait for the derive macro generated code
        use turbo_tasks::ShrinkToFit as _;

        // Generated TaskFlags bitfield
        #task_flags_bitfield

        // Generated LazyField enum
        #lazy_field_enum

        // Generated TaskStorage struct (unified)
        #typed_storage_struct

        // Generated accessor methods
        #accessor_methods

        // Generated encode/decode methods
        #encode_decode_methods

        // Generated snapshot clone and restore methods
        #snapshot_restore_methods

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

            #[doc = "Create from raw bits (for deserialization)"]
            pub fn from_bits(bits: u16) -> Self {
                Self(bits)
            }
        }
    }
}

/// Generate the LazyField enum containing all lazy fields
fn generate_lazy_field_enum(grouped_fields: &GroupedFields) -> TokenStream {
    let all_lazy_fields: Vec<_> = grouped_fields.all_lazy().collect();

    // If no lazy_vec fields, don't generate the enum
    if all_lazy_fields.is_empty() {
        return quote! {};
    }

    // Generate enum variants
    let variants: Vec<_> = all_lazy_fields
        .iter()
        .map(|field| {
            let variant_name = &field.variant_name;
            let field_type = &field.field_type;
            quote! {
                #variant_name(#field_type)
            }
        })
        .collect();

    // Generate is_empty method arms
    let is_empty_arms: Vec<_> = all_lazy_fields
        .iter()
        .map(|field| {
            let variant_name = &field.variant_name;
            // For collection types, check if empty; for direct types, presence means non-empty
            match field.storage_type {
                StorageType::Direct => {
                    // For direct types, presence of the variant means it's non-empty
                    // (the Vec<LazyField> provides optionality, not Option<T>)
                    quote! {
                        LazyField::#variant_name(_) => false
                    }
                }
                _ => {
                    // For collection types, delegate to is_empty()
                    quote! {
                        LazyField::#variant_name(v) => v.is_empty()
                    }
                }
            }
        })
        .collect();

    // Generate is_persistent (transient check) method arms
    let is_persistent_arms: Vec<_> = all_lazy_fields
        .iter()
        .map(|field| {
            let variant_name = &field.variant_name;
            let is_persistent = !field.is_transient();
            quote! {
                LazyField::#variant_name(_) => #is_persistent
            }
        })
        .collect();

    // Generate is_meta/is_data method arms
    let is_meta_arms: Vec<_> = all_lazy_fields
        .iter()
        .map(|field| {
            let variant_name = &field.variant_name;
            let is_meta = field.category == Category::Meta;
            quote! {
                LazyField::#variant_name(_) => #is_meta
            }
        })
        .collect();

    quote! {
        #[doc = "All lazily-allocated fields stored in a single Vec."]
        #[doc = "Fields are stored directly (unboxed) to avoid allocation overhead."]
        #[automatically_derived]
        #[derive(Debug, Clone, PartialEq, turbo_tasks::ShrinkToFit)]
        #[shrink_to_fit(crate = "turbo_tasks::macro_helpers::shrink_to_fit")]
        pub enum LazyField {
            #(#variants),*
        }

        #[automatically_derived]
        impl LazyField {
            #[doc = "Returns true if this field is empty (can be removed from the Vec)"]
            pub fn is_empty(&self) -> bool {
                match self {
                    #(#is_empty_arms),*
                }
            }

            #[doc = "Returns true if this field should be persisted (not transient)"]
            pub fn is_persistent(&self) -> bool {
                match self {
                    #(#is_persistent_arms),*
                }
            }

            #[doc = "Returns true if this field belongs to the meta category"]
            pub fn is_meta(&self) -> bool {
                match self {
                    #(#is_meta_arms),*
                }
            }

            #[doc = "Returns true if this field belongs to the data category"]
            pub fn is_data(&self) -> bool {
                !self.is_meta()
            }
        }
    }
}

/// Generate the unified TaskStorage struct with all fields directly on it.
fn generate_typed_storage_struct(grouped_fields: &GroupedFields) -> TokenStream {
    let has_lazy = grouped_fields.has_lazy();
    let has_flags = grouped_fields.has_flags();

    // Collect all field definitions from both categories
    let mut field_defs = Vec::new();

    // Add inline fields directly on TaskStorage (private - use accessor methods)
    // Note: No bincode attributes since we don't derive Encode/Decode (manual serialization)
    for field in grouped_fields.all_inline() {
        let field_name = &field.field_name;
        let field_type = &field.field_type;
        field_defs.push(quote! {
            #field_name: #field_type
        });
    }

    // Add flags bitfield if needed (pub(crate) - used by TaskFlags methods)
    let flags_field = if has_flags {
        quote! {
            #[doc = "Combined bitfield for boolean flags (persisted + transient)"]
            pub(crate) flags: TaskFlags,
        }
    } else {
        quote! {}
    };

    // Add lazy vec field if needed (pub(crate) - used by helper methods)
    // Note: Serialization is handled manually via encode_data/encode_meta methods
    let lazy_field = if has_lazy {
        quote! {
            #[doc = "Lazily-allocated fields stored in a single Vec for memory efficiency"]
            lazy: Vec<LazyField>,
        }
    } else {
        quote! {}
    };

    // Note: Helper methods like find_lazy, find_lazy_mut, get_or_create_lazy, and
    // remove_if_empty are defined in storage_schema.rs rather than generated here.
    // This provides better IDE support (autocomplete, go-to-definition, etc.).

    // Note: We don't derive bincode::Encode/Decode here since serialization
    // will be handled manually via encode_data/encode_meta/decode_data/decode_meta methods
    quote! {
        #[doc = "Unified typed storage containing all task fields."]
        #[doc = "This is designed to be embedded in the actual InnerStorage for incremental migration."]
        #[automatically_derived]
        #[derive(Debug, Default, turbo_tasks::ShrinkToFit)]
        #[shrink_to_fit(crate = "turbo_tasks::macro_helpers::shrink_to_fit")]
        pub struct TaskStorage {
            #(#field_defs,)*
            #flags_field
            #lazy_field
        }

        #[automatically_derived]
        impl TaskStorage {
            pub fn new() -> Self {
                Self::default()
            }
        }
    }
}

fn generate_accessor_methods(grouped_fields: &GroupedFields) -> TokenStream {
    let mut methods = TokenStream::new();

    // Generate accessor methods for all fields on TaskStorage
    // This encapsulates the storage strategy - callers use methods, not field access
    for field in grouped_fields.all_fields() {
        methods.extend(generate_field_accessors(field));
    }

    quote! {
        #[automatically_derived]
        impl TaskStorage {
            #methods
        }
    }
}

/// Generate accessor methods on TaskStorage for a field.
///
/// Works for both inline and lazy fields. Uses FieldInfo helpers to generate
/// the appropriate access patterns.
///
/// For Direct fields, generates: `get_{field}()`, `set_{field}()`, `take_{field}()`
/// For Collection fields, generates: `{field}()`, `{field}_mut()`
fn generate_field_accessors(field: &FieldInfo) -> TokenStream {
    let field_name = &field.field_name;
    let field_type = &field.field_type;

    match field.storage_type {
        StorageType::Direct => generate_direct_field_accessors(field),
        StorageType::AutoSet | StorageType::AutoMap | StorageType::CounterMap => {
            generate_collection_field_accessors(field, field_name, field_type)
        }
        StorageType::Flag => {
            // Flag fields have accessors generated on TaskFlags, not TaskStorage
            unreachable!("Flag fields should not reach generate_field_accessors")
        }
    }
}

/// Generate Direct field accessors on TaskStorage (get/set/take, and get_mut for lazy).
fn generate_direct_field_accessors(field: &FieldInfo) -> TokenStream {
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
        // Inline with default: field is T stored directly, uses Default::default() for "empty"
        quote! {
            #vis fn #get_name(&self) -> Option<&#field_type> {
                if self.#field_name != #field_type::default() {
                    Some(&self.#field_name)
                } else {
                    None
                }
            }

            #vis fn #set_name(&mut self, value: #field_type) -> Option<#field_type> {
                let old = std::mem::replace(&mut self.#field_name, value);
                if old != #field_type::default() {
                    Some(old)
                } else {
                    None
                }
            }

            #vis fn #take_name(&mut self) -> Option<#field_type> {
                let old = std::mem::take(&mut self.#field_name);
                if old != #field_type::default() {
                    Some(old)
                } else {
                    None
                }
            }
        }
    } else if field.is_inline() {
        // Inline: field is Option<T> stored directly on TaskStorage
        let inner_type = extract_option_inner_type(field_type);

        quote! {
            #vis fn #get_name(&self) -> Option<&#inner_type> {
                self.#field_name.as_ref()
            }

            #vis fn #set_name(&mut self, value: #inner_type) -> Option<#inner_type> {
                self.#field_name.replace(value)
            }

            #vis fn #take_name(&mut self) -> Option<#inner_type> {
                self.#field_name.take()
            }
        }
    } else {
        // Lazy: field is stored in Vec<LazyField>
        let extractor = field.lazy_extractor_closure();
        let matches_closure = field.lazy_matches_closure();
        let unwrap_owned = field.lazy_unwrap_closure();
        let constructor = field.lazy_constructor(quote! { value });

        quote! {
            #vis fn #get_name(&self) -> Option<&#field_type> {
                self.find_lazy(#extractor)
            }

            #[doc = "Set the field value, returning the old value if present."]
            #vis fn #set_name(&mut self, value: #field_type) -> Option<#field_type> {
                self.set_lazy(#matches_closure, #unwrap_owned, #constructor)
            }

            #vis fn #take_name(&mut self) -> Option<#field_type> {
                self.take_lazy(#matches_closure, #unwrap_owned)
            }

            #[doc = "Get a mutable reference to the field value (if present)."]
            #[doc = ""]
            #[doc = "Unlike `get_or_create_lazy` for collections, this does NOT allocate"]
            #[doc = "if the field is absent - it returns None instead."]
            #vis fn #get_mut_name(&mut self) -> Option<&mut #field_type> {
                self.find_lazy_mut(#extractor)
            }
        }
    }
}

/// Generate collection field accessors on TaskStorage (ref/mut).
fn generate_collection_field_accessors(
    field: &FieldInfo,
    field_name: &syn::Ident,
    field_type: &syn::Type,
) -> TokenStream {
    let ref_name = field.ref_ident();
    let mut_name = field.mut_ident();
    let take_name = field.take_ident();
    let vis = if field.is_pub {
        quote! {pub}
    } else {
        quote! {}
    };

    if field.is_inline() {
        // Inline: direct field access
        quote! {
            #vis fn #ref_name(&self) -> &#field_type {
                &self.#field_name
            }

            #vis fn #mut_name(&mut self) -> &mut #field_type {
                &mut self.#field_name
            }

            #vis fn #take_name(&mut self) -> #field_type {
                std::mem::take(&mut self.#field_name)
            }
        }
    } else {
        // Lazy: use find_lazy / get_or_create_lazy
        let extractor = field.lazy_extractor_closure();
        let matches_closure = field.lazy_matches_closure();
        let unwrap_closure = field.lazy_unwrap_closure();
        let constructor = field.lazy_constructor(quote! { Default::default() });

        quote! {
            #vis fn #ref_name(&self) -> Option<&#field_type> {
                self.find_lazy(#extractor)
            }

            #vis fn #mut_name(&mut self) -> &mut #field_type {
                self.get_or_create_lazy(
                    #matches_closure,
                    #unwrap_closure,
                    || #constructor,
                )
            }

            #vis fn #take_name(&mut self) -> Option<#field_type> {
                self.take_lazy(
                    #matches_closure,
                    #unwrap_closure,
                )
            }
        }
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
        #[doc = "This trait is auto-generated by the TaskStorage macro."]
        #[doc = "Implementors only need to provide `typed()`, `typed_mut()`, `track_modification()`,"]
        #[doc = "and `check_access()` methods, and all accessor methods are provided automatically."]
        #[doc = ""]
        #[doc = "This is designed to work with TaskGuard."]
        #[automatically_derived]
        pub trait TaskStorageAccessors {
            #[doc = "Access the typed storage (read-only)"]
            fn typed(&self) -> &TaskStorage;

            #[doc = "Access the typed storage (mutable)."]
            #[doc = ""]
            #[doc = "Note: This does NOT track modifications. Call `track_modification()` separately"]
            #[doc = "when the data actually changes. This split allows generated accessors to"]
            #[doc = "only track modifications when actual changes occur."]
            fn typed_mut(&mut self) -> &mut TaskStorage;

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
/// - For lazy: delegates to TaskStorage accessors
fn generate_trait_accessor_methods(field: &FieldInfo) -> TokenStream {
    let field_type = &field.field_type;
    let check_access = field.check_access_call();
    let ref_expr = field.collection_ref_expr();
    let is_option = field.is_option_ref();

    match field.storage_type {
        StorageType::Direct => {
            // Direct storage delegates to TaskStorage accessor methods
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
                        self.typed_mut().flags.#set_name(value);
                        #track_modification
                    }
                }
            }
        }
    }
}

/// Generate Direct field accessors for TaskStorageAccessors trait.
///
/// Uses `FieldInfo` helpers to delegate to TaskStorage accessor methods,
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

    // Use FieldInfo helpers for TaskStorage delegation
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
                // For inline fields, access the field directly
                let field_name = &field.field_name;
                if field.use_default {
                    // For fields with default semantics, always return Some(&mut self.field)
                    quote! {
                        #[doc = "Get a mutable reference to the field value."]
                        #[doc = ""]
                        #[doc = "Tracks modification pessimistically - assumes caller will mutate."]
                        fn #get_mut_name(&mut self) -> &mut #value_type {
                            #check_access
                            #track_modification
                            &mut self.typed_mut().#field_name
                        }
                    }
                } else {
                    // For Option fields, return as_mut()
                    quote! {
                        #[doc = "Get a mutable reference to the field value (if present)."]
                        fn #get_mut_name(&mut self) -> Option<&mut #value_type> {
                            #check_access
                            #track_modification
                            self.typed_mut().#field_name.as_mut()
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

        #[doc = "Set the field value, returning the old value if present"]
        fn #set_name(&mut self, value: #value_type) -> Option<#value_type> {
            #check_access
            #track_modification
            #set_expr(value)
        }

        #[doc = "Take the field value, clearing it"]
        #[doc = ""]
        #[doc = "Only tracks modification if there was a value to take."]
        fn #take_name(&mut self) -> Option<#value_type> {
            #check_access
            let value = #take_expr;
            if value.is_some() {
                #track_modification
            }
            value
        }

        #get_mut_accessor
    }
}

/// Generate add/remove/has/iter/len/is_empty operations for an AutoSet field.
///
/// Uses `FieldInfo` helpers to generate the correct access patterns:
/// - For inline: direct field access via `self.typed().field` / `self.typed_mut().field`
/// - For lazy: delegates to TaskStorage accessors
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

    // Remove uses find_lazy_mut for lazy to avoid allocation.
    let remove_body = if is_option {
        let extractor = field.lazy_extractor_closure();

        quote! {
            let Some(set) = self.typed_mut().find_lazy_mut(#extractor) else {
                return false;
            };
            let removed = set.remove(item);
            if removed {
                #track_modification
            }
            return removed;

        }
    } else {
        quote! {
            let removed = #mut_expr.remove(item);
            if removed {
                #track_modification
            }
            removed
        }
    };

    let set_body = if is_option {
        let unwraper = field.lazy_unwrap_closure();
        let matches = field.lazy_matches_closure();
        let ctor = field.lazy_constructor(quote! {set});
        quote! {
             self.typed_mut().set_lazy(#matches, #unwraper, #ctor)
        }
    } else {
        quote! {
            let old = #take_expr;
            *#mut_expr = set;
            Some(old)
        }
    };

    quote! {
        #[doc = "Check if the set contains an item"]
        fn #has_name(&self, item: &#element_type) -> bool {
            #check_access
            #has_body
        }

        #[doc = "Add an item to the set."]
        #[doc = "Returns true if the item was newly added, false if it already existed."]
        #[must_use]
        fn #add_name(&mut self, item: #element_type) -> bool {
            #check_access
            let added = #mut_expr.insert(item);
            if added {
                #track_modification
            }
            added
        }

        #[doc = "Add multiple items to the set from an iterator."]
        #[doc = "Only tracks modification if at least one item is actually added."]
        fn #extend_name(&mut self, items: impl IntoIterator<Item = #element_type>) {
            #check_access
            let set = #mut_expr;
            let mut any_added = false;
            for item in items {
                if set.insert(item) {
                    any_added = true;
                }
            }
            if any_added {
                #track_modification
            }
        }

        #[doc = "Remove an item from the set."]
        #[doc = "Returns true if the item was present and removed, false if it wasn't present."]
        fn #remove_name(&mut self, item: &#element_type) -> bool {
            #check_access
            #remove_body
        }

        #[doc = "Remove multiple items from the set."]
        #[doc = "Only tracks modification if at least one item is actually removed."]
        fn #set_name(&mut self, set: #field_type) -> Option<#field_type>
        {
            #check_access
            #track_modification
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
/// - For lazy: delegates to TaskStorage accessors via `self.typed().field()` /
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

    // Generate remove body - for lazy fields, we need to check if the map exists first
    // without allocating it. For inline fields, we can use the mut_expr directly.
    let remove_body = if is_option {
        // Lazy: use find_lazy_mut to avoid allocating, only track modification if something was
        let extractor = field.lazy_extractor_closure();
        quote! {
            let map = self.typed_mut().find_lazy_mut(#extractor)?;
            let result = map.remove(key);
            if result.is_some() {
                #track_modification
            }
            result
        }
    } else {
        // Inline: direct access, only track modification if something was removed
        quote! {
            let result = #mut_expr.remove(key);
            if result.is_some() {
                #track_modification
            }
            result
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

        quote! {
            #[doc = "Update a signed counter by the given delta."]
            #[doc = "Returns true if the count crossed the positive boundary (became positive or non-positive)."]
            #[must_use]
            fn #update_positive_crossing_name(&mut self, key: #key_type, delta: #value_type) -> bool {
                #check_access
                #track_modification
                #mut_expr.update_positive_crossing(key, delta)
            }
        }
    } else {
        quote! {}
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
            #track_modification
            #mut_expr.update_count(key, delta)
        }

        #[doc = "Update multiple counters by the given delta."]
        #[doc = "More efficient than calling update_count in a loop."]
        fn #update_counts_name(&mut self, keys: impl Iterator<Item = #key_type>, delta: #value_type) {
            #check_access
            #track_modification
            let map = #mut_expr;
            for key in keys {
                map.update_count(key, delta);
            }
        }

        #[doc = "Update a counter by the given delta and return the new value."]
        fn #update_and_get_name(&mut self, key: #key_type, delta: #value_type) -> #value_type {
            #check_access
            #track_modification
            #mut_expr.update_and_get(key, delta)
        }

        #[doc = "Update a counter using a closure that receives the current value"]
        #[doc = "(or None if not present) and returns the new value (or None to remove)."]
        fn #update_with_name<F>(&mut self, key: #key_type, f: F)
        where
            F: FnOnce(Option<#value_type>) -> Option<#value_type>,
        {
            #check_access
            #track_modification
            #mut_expr.update_with(key, f)
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
/// - For lazy: delegates to TaskStorage accessors
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

    let Some((key_type, value_type)) = extract_map_types(field_type, "AutoMap") else {
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
        quote! {self.typed_mut().#take_name();}
    };

    // Generate remove body - for lazy fields, avoid allocation if map doesn't exist.
    // Using ? operator to early-return None if map doesn't exist.
    let remove_body = if is_option {
        let extractor = field.lazy_extractor_closure();
        quote! {
            let map = self.typed_mut().find_lazy_mut(#extractor)?;
            let result = map.remove(key);
            if result.is_some() {
                #track_modification
            }
            result
        }
    } else {
        quote! {
            let result = #mut_expr.remove(key);
            if result.is_some() {
                #track_modification
            }
            result
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
        #[doc = "Only tracks modification if an entry was actually removed."]
        fn #take_name(&mut self) -> Option<#field_type> {
            #check_access
            let value = #take_expression;
            if value.is_some() {
                #track_modification
            }
            value
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
    // Generate shrink calls for inline collection fields with shrink_on_completion
    let mut inline_shrinks = Vec::new();
    for field in grouped_fields.all_inline() {
        if field.is_flag() {
            continue;
        }
        if !field.shrink_on_completion {
            continue;
        }
        // Only collection types can be shrunk
        let is_collection = matches!(
            field.storage_type,
            StorageType::AutoSet | StorageType::AutoMap | StorageType::CounterMap
        );
        if is_collection {
            let field_name = &field.field_name;
            inline_shrinks.push(quote! {
                typed.#field_name.shrink_to_fit();
            });
        }
    }

    // Generate match arms for lazy fields that have cleanup attributes
    let mut match_arms = Vec::new();

    for field in grouped_fields.all_lazy() {
        // Skip flags - they're in the bitfield, not the lazy vec
        if field.is_flag() {
            continue;
        }

        let variant_name = &field.variant_name;
        let shrink = field.shrink_on_completion;
        let drop_if_immutable = field.drop_on_completion_if_immutable;

        // Skip fields with no cleanup attributes
        if !shrink && !drop_if_immutable {
            continue;
        }

        // Determine whether this is a collection type that can be shrunk
        let is_collection = matches!(
            field.storage_type,
            StorageType::AutoSet | StorageType::AutoMap | StorageType::CounterMap
        );

        // Each arm returns bool: true = keep, false = remove
        let arm_body = match (shrink, drop_if_immutable, is_collection) {
            // shrink_on_completion + drop_on_completion_if_immutable + collection
            (true, true, true) => quote! {
                if is_immutable {
                    false // drop for immutable tasks
                } else if c.is_empty() {
                    false // remove empty
                } else {
                    c.shrink_to_fit();
                    true // keep
                }
            },
            // shrink_on_completion only + collection
            (true, false, true) => quote! {
                if c.is_empty() {
                    false // remove empty
                } else {
                    c.shrink_to_fit();
                    true // keep
                }
            },
            // drop_on_completion_if_immutable only + collection
            (false, true, true) => quote! {
                !is_immutable // keep if mutable, drop if immutable
            },
            // shrink_on_completion + drop_on_completion_if_immutable + direct value
            (true, true, false) => quote! {
                !is_immutable // keep if mutable, drop if immutable
            },
            // shrink_on_completion only + direct value (unusual but handle it)
            (true, false, false) => quote! {
                true // keep (direct values don't need shrinking)
            },
            // drop_on_completion_if_immutable only + direct value
            (false, true, false) => quote! {
                !is_immutable // keep if mutable, drop if immutable
            },
            // No attributes (shouldn't reach here due to continue above)
            (false, false, _) => unreachable!(),
        };

        match_arms.push(quote! {
            LazyField::#variant_name(c) => #arm_body,
        });
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

            // Shrink inline collection fields (always present, not in lazy vec)
            #(#inline_shrinks)*

            // swap_retain pattern: iterate with manual index, swap_remove to delete
            let mut i = 0;
            while i < typed.lazy.len() {
                let keep = match &mut typed.lazy[i] {
                    #(#match_arms)*
                    // Fields without cleanup attributes - keep as-is
                    _ => true,
                };
                if keep {
                    i += 1;
                } else {
                    typed.lazy.swap_remove(i);
                }
            }

            typed.lazy.shrink_to_fit();
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
    let lazy: Vec<_> = grouped_fields.persistent_lazy(category).collect();
    let lazy_encode = generate_encode_lazy_fields(&lazy);

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
                self.#field_name = bincode::Decode::decode(decoder)?;
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

/// Generate encode/decode methods for TaskStorage serialization.
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
        impl TaskStorage {
            /// Encode meta category fields directly to bincode.
            /// Only persistent (non-transient) fields are encoded.
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
            pub fn encode_data<E: bincode::enc::Encoder>(
                &self,
                encoder: &mut E,
            ) -> Result<(), bincode::error::EncodeError> {
                #encode_data_body
                #encode_data_flags
                Ok(())
            }

            /// Decode meta category fields from bincode.
            /// Only persistent (non-transient) fields are decoded.
            pub fn decode_meta<D: bincode::de::Decoder>(
                &mut self,
                decoder: &mut D,
            ) -> Result<(), bincode::error::DecodeError> {
                #decode_meta_body
                #decode_meta_flags
                Ok(())
            }

            /// Decode data category fields from bincode.
            /// Only persistent (non-transient) fields are decoded.
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

/// Sentinel byte marking the end of lazy fields in serialization.
const LAZY_FIELD_SENTINEL: u8 = 0x00;

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
/// For filtered fields, uses a single-pass collect to a Vec, then encodes.
/// This avoids multiple iterations (check non-empty + count + encode).
fn generate_encode_value(field: &FieldInfo, value_ref: TokenStream) -> TokenStream {
    let Some((predicate, pred_type)) = generate_filter_predicate(field) else {
        // No filtering needed, just encode normally
        return quote! {
            bincode::Encode::encode(#value_ref, encoder)?;
        };
    };

    match pred_type {
        FilterPredicateType::Option => {
            // For Option<T>, check if the value is transient and encode None if so
            quote! {
                {
                    let filtered_value = (#value_ref).as_ref().filter(#predicate);
                    bincode::Encode::encode(&filtered_value, encoder)?;
                }
            }
        }
        FilterPredicateType::Set => {
            // For AutoSet<K>, filter out transient keys - collect once then encode
            quote! {
                {
                    let filtered: Vec<_> = (#value_ref).iter().filter(#predicate).collect();
                    bincode::Encode::encode(&filtered.len(), encoder)?;
                    for key in filtered {
                        bincode::Encode::encode(key, encoder)?;
                    }
                }
            }
        }
        FilterPredicateType::CounterMap => {
            // For counter maps, filter out entries with transient keys - collect once
            quote! {
                {
                    let filtered: Vec<_> = (#value_ref).iter().filter(#predicate).collect();
                    bincode::Encode::encode(&filtered.len(), encoder)?;
                    for (key, value) in filtered {
                        bincode::Encode::encode(key, encoder)?;
                        bincode::Encode::encode(value, encoder)?;
                    }
                }
            }
        }
        FilterPredicateType::Map => {
            // For maps, filter out entries with transient keys or values - collect once
            quote! {
                {
                    let filtered: Vec<_> = (#value_ref).iter().filter(#predicate).collect();
                    bincode::Encode::encode(&filtered.len(), encoder)?;
                    for (key, value) in filtered {
                        bincode::Encode::encode(key, encoder)?;
                        bincode::Encode::encode(value, encoder)?;
                    }
                }
            }
        }
    }
}

/// Generate code to encode an inline field to bincode.
///
/// Delegates to `generate_encode_value` with `&self.field_name` as the value reference.
fn generate_encode_inline_field(field: &FieldInfo) -> TokenStream {
    let field_name = &field.field_name;
    generate_encode_value(field, quote! { &self.#field_name })
}

/// Generate code to encode a lazy field value with index.
///
/// For filtered fields, collects to a Vec first, then checks if non-empty before
/// writing index. This avoids multiple iterations over the data.
fn generate_encode_lazy_field_with_index(field: &FieldInfo, index: u8) -> TokenStream {
    let Some((predicate, pred_type)) = generate_filter_predicate(field) else {
        // No filtering needed - encode directly
        return quote! {
            bincode::Encode::encode(&#index, encoder)?;
            bincode::Encode::encode(data, encoder)?;
        };
    };

    match pred_type {
        FilterPredicateType::Option => {
            // For Option<T>, check if the value is transient
            quote! {
                {
                    let filtered_value = data.as_ref().filter(#predicate);
                    if filtered_value.is_some() {
                        bincode::Encode::encode(&#index, encoder)?;
                        bincode::Encode::encode(&filtered_value, encoder)?;
                    }
                }
            }
        }
        FilterPredicateType::Set => {
            // Collect once, check if non-empty, then encode
            quote! {
                {
                    let filtered: Vec<_> = data.iter().filter(#predicate).collect();
                    if !filtered.is_empty() {
                        bincode::Encode::encode(&#index, encoder)?;
                        bincode::Encode::encode(&filtered.len(), encoder)?;
                        for key in filtered {
                            bincode::Encode::encode(key, encoder)?;
                        }
                    }
                }
            }
        }
        FilterPredicateType::CounterMap | FilterPredicateType::Map => {
            // Collect once, check if non-empty, then encode
            quote! {
                {
                    let filtered: Vec<_> = data.iter().filter(#predicate).collect();
                    if !filtered.is_empty() {
                        bincode::Encode::encode(&#index, encoder)?;
                        bincode::Encode::encode(&filtered.len(), encoder)?;
                        for (key, value) in filtered {
                            bincode::Encode::encode(key, encoder)?;
                            bincode::Encode::encode(value, encoder)?;
                        }
                    }
                }
            }
        }
    }
}

/// Generate code to encode lazy fields to bincode.
/// Uses sentinel-terminated format: [index, data]... [sentinel]
fn generate_encode_lazy_fields(fields: &[&FieldInfo]) -> TokenStream {
    if fields.is_empty() {
        return quote! {};
    }

    // Generate match arms for encoding each field variant
    let encode_arms = gen_lazy_match_arms(fields.iter().copied(), |idx, field| {
        // add 1 so 0 is reserved for the sentinel
        let idx = idx as u8 + 1;
        generate_encode_lazy_field_with_index(field, idx)
    });

    quote! {
        // Encode each persistent lazy field in this category
        for field in &self.lazy {
            match field {
                #(#encode_arms)*
                _ => {} // Skip fields not in this category
            }
        }
        // Write sentinel to mark end of lazy fields
        bincode::Encode::encode(&#LAZY_FIELD_SENTINEL, encoder)?;
    }
}

/// Generate code to decode lazy fields from bincode.
/// Reads until sentinel byte (0x00) is encountered.
fn generate_decode_lazy_fields(fields: &[&FieldInfo]) -> TokenStream {
    if fields.is_empty() {
        return quote! {};
    }

    // Generate match arms for decoding each field variant
    let decode_arms: Vec<_> = fields
        .iter()
        .enumerate()
        .map(|(idx, field)| {
            let variant_name = &field.variant_name;
            let idx = idx as u8 + 1;
            quote! {
                #idx => LazyField::#variant_name(bincode::Decode::decode(decoder)?)
            }
        })
        .collect();

    quote! {
        // Decode lazy fields until LAZY_FIELD_SENTINEL
        loop {
            let idx: u8 = bincode::Decode::decode(decoder)?;
            let field = match idx {
                #(#decode_arms,)*
                #LAZY_FIELD_SENTINEL => {
                    break
                }
                _ => {
                    return Err(bincode::error::DecodeError::OtherString(
                        format!("Unknown lazy field index: {idx}"),
                    ));
                }
            };
            self.lazy.push(field);
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

/// Generate clone lazy match arms for a category.
fn gen_clone_lazy_arms_for_category(
    grouped_fields: &GroupedFields,
    category: Category,
) -> Vec<TokenStream> {
    gen_lazy_match_arms(grouped_fields.persistent_lazy(category), |_, field| {
        let variant_name = &field.variant_name;
        quote! { snapshot.lazy.push(LazyField::#variant_name(data.clone())); }
    })
}

/// Generate restore inline statements for a category.
fn gen_restore_inline_for_category(
    grouped_fields: &GroupedFields,
    category: Category,
) -> Vec<TokenStream> {
    gen_restore_inline_fields(grouped_fields.persistent_inline(category))
}

/// Generate snapshot clone and restore methods for TaskStorage.
///
/// Generates:
/// - `clone_meta_snapshot(&self) -> TaskStorage` - Clone only persistent meta fields
/// - `clone_data_snapshot(&self) -> TaskStorage` - Clone only persistent data fields
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

    // Generate flags handling for clone - per category
    let clone_meta_flags = if has_meta_flags {
        quote! {
            // Clone persisted meta flags
            snapshot.flags.set_persisted_meta_bits(self.flags.persisted_meta_bits());
        }
    } else {
        quote! {}
    };

    let clone_data_flags = if has_data_flags {
        quote! {
            // Clone persisted data flags
            snapshot.flags.set_persisted_data_bits(self.flags.persisted_data_bits());
        }
    } else {
        quote! {}
    };

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

    let restore_all_flags = if has_any_flags {
        quote! {
            // Restore all persisted flags (preserve transient flags)
            self.flags.set_persisted_bits(source.flags.persisted_bits());
        }
    } else {
        quote! {}
    };

    quote! {
        #[automatically_derived]
        impl TaskStorage {
            /// Create a snapshot containing all persistent fields (both meta and data).
            ///
            /// This clones all persistent fields into a new TaskStorage, skipping
            /// transient fields that may not be cloneable. Use this for the `Both`
            /// snapshot case where both meta and data are dirty.
            pub fn clone_snapshot(&self) -> TaskStorage {
                let mut snapshot = TaskStorage::new();

                // Clone inline meta fields
                #(#clone_meta_inline)*

                // Clone inline data fields
                #(#clone_data_inline)*

                #clone_all_flags

                // Clone all persistent lazy fields (both meta and data)
                for field in &self.lazy {
                    match field {
                        #(#clone_data_lazy_arms)*
                        #(#clone_meta_lazy_arms)*
                        // Skip transient fields
                        _ => {}
                    }
                }

                snapshot
            }

            /// Create a snapshot containing only meta category fields for serialization.
            ///
            /// This clones only the persistent meta fields into a new TaskStorage,
            /// which can then be serialized outside the lock.
            pub fn clone_meta_snapshot(&self) -> TaskStorage {
                let mut snapshot = TaskStorage::new();

                // Clone inline meta fields
                #(#clone_meta_inline)*

                #clone_meta_flags

                // Clone lazy meta fields (only persistent ones)
                for field in &self.lazy {
                    match field {
                        #(#clone_meta_lazy_arms)*
                        // Skip transient and data fields
                        _ => {}
                    }
                }

                snapshot
            }

            /// Create a snapshot containing only data category fields for serialization.
            ///
            /// This clones only the persistent data fields into a new TaskStorage,
            /// which can then be serialized outside the lock.
            pub fn clone_data_snapshot(&self) -> TaskStorage {
                let mut snapshot = TaskStorage::new();

                // Clone inline data fields
                #(#clone_data_inline)*

                #clone_data_flags

                // Clone lazy data fields (only persistent ones)
                for field in &self.lazy {
                    match field {
                        #(#clone_data_lazy_arms)*
                        // Skip transient and meta fields
                        _ => {}
                    }
                }

                snapshot
            }

            /// Restore persisted data from a decoded TaskStorage.
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
            /// - `All`: Restore both meta and data fields
            pub fn restore_from(
                &mut self,
                source: TaskStorage,
                category: crate::backend::TaskDataCategory,
            ) {
                match category {
                    crate::backend::TaskDataCategory::Meta => self.restore_meta_from(source),
                    crate::backend::TaskDataCategory::Data => self.restore_data_from(source),
                    crate::backend::TaskDataCategory::All => self.restore_all_from(source),
                }
            }

            /// Restore meta category fields from source.
            ///
            /// Debug assertions verify that the target doesn't already have the lazy fields
            /// being restored.
            fn restore_meta_from(&mut self, source: TaskStorage) {
                // Debug assertion: verify target doesn't already have persistent meta lazy fields
                debug_assert!(
                    !self.lazy.iter().any(|f| f.is_persistent() && f.is_meta()),
                    "restore_meta_from called on storage that already has persistent meta lazy fields"
                );

                // Inline meta fields - direct assignment
                #(#restore_meta_inline)*

                #restore_meta_flags

                // Extend lazy vec with persistent meta fields from source
                self.lazy.extend(
                    source.lazy.into_iter().filter(|f| f.is_persistent() && f.is_meta())
                );
            }

            /// Restore data category fields from source.
            ///
            /// Debug assertions verify that the target doesn't already have the lazy fields
            /// being restored.
            fn restore_data_from(&mut self, source: TaskStorage) {
                // Debug assertion: verify target doesn't already have persistent data lazy fields
                debug_assert!(
                    !self.lazy.iter().any(|f| f.is_persistent() && f.is_data()),
                    "restore_data_from called on storage that already has persistent data lazy fields"
                );

                // Inline data fields - direct assignment
                #(#restore_data_inline)*

                #restore_data_flags

                // Extend lazy vec with persistent data fields from source
                self.lazy.extend(
                    source.lazy.into_iter().filter(|f| f.is_persistent() && f.is_data())
                );
            }

            /// Restore all fields from source (both meta and data).
            ///
            /// Debug assertions verify that the target doesn't already have the lazy fields
            /// being restored.
            fn restore_all_from(&mut self, source: TaskStorage) {
                // Debug assertion: verify target doesn't already have any persistent lazy fields
                debug_assert!(
                    !self.lazy.iter().any(|f| f.is_persistent()),
                    "restore_all_from called on storage that already has persistent lazy fields"
                );

                // Inline meta fields - direct assignment
                #(#restore_meta_inline)*

                // Inline data fields - direct assignment
                #(#restore_data_inline)*

                #restore_all_flags

                // Extend lazy vec with all persistent fields from source
                self.lazy.extend(
                    source.lazy.into_iter().filter(|f| f.is_persistent())
                );
            }
        }
    }
}
