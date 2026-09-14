# Singleton Pattern

In the context of turbo-tasks, the singleton pattern can be used to intern a value into a `Vc`. This ensures that for a single value, there is exactly one resolved `Vc`. This makes it safer to compare [`ResolvedVc`]s for equality and use them as keys in [`IndexMap`]s or [`HashMap`]s.

[`IndexMap`]: indexmap::map::IndexMap
[`HashMap`]: std::collections::HashMap

## Usage

To use the singleton pattern in turbo-tasks:

1. Make the `.cell()` method private (Use [`#[turbo_tasks::value]`][value] instead of [`#[turbo_tasks::value(shared)]`][value]).
2. Only call the `.cell()` method in a single [`#[turbo_tasks::function]`][function] which acts as a constructor.
3. The [constructor arguments][TaskInput] act as a key for the constructor task which ensures that the same value is always celled in the same task.
4. Keep in mind that you should only compare `ResolvedVc`s by equality. Unresolved `Vc`s might not be equal to each other.

[value]: crate::value
[function]: crate::function
[TaskInput]: crate::TaskInput

## Example

```ignore
#[turbo_tasks::value]
struct SingletonString {
    value: String,
}

#[turbo_tasks::value_impl]
impl SingletonString {
    #[turbo_tasks::function]
    fn new(value: String) -> Vc<SingletonString> {
        Self { value }.cell()
    }
}

#[test]
fn test_singleton() {
    let a1 = SingletonString::new("a".to_string()).to_resolved().await?;
    let a2 = SingletonString::new("a".to_string()).to_resolved().await?;
    let b = SingletonString::new("b".to_string()).to_resolved().await?;
    assert_eq!(a1, a2); // Resolved Vcs are equal
    assert_ne!(a1, b);

    let set = HashSet::from([a1, a2, b]);
    assert_eq!(set.len(), 2); // Only two different values
}
```

In this example, `SingletonString` is a struct that contains a single `String` value. The `new` function acts as a constructor for `SingletonString`, ensuring that the same string value is always celled in the same task.
