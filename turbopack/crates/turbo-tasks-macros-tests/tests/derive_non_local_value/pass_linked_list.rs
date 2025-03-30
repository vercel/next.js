use turbo_tasks::NonLocalValue;

#[derive(NonLocalValue)]
// use an inline type constraint here
struct LinkedList<T: NonLocalValue> {
    // LinkedListNode is also a NonLocalValue
    head: Option<Box<LinkedListNode<T>>>,
}

#[derive(NonLocalValue)]
struct LinkedListNode<T>
where
    T: NonLocalValue, // use a where type constraint here
{
    current: T,
    // A self-recursive type
    next: Option<Box<LinkedListNode<T>>>,
}

fn main() {
    let ll = LinkedList {
        head: Some(Box::new(LinkedListNode {
            current: 1,
            next: Some(Box::new(LinkedListNode {
                current: 2,
                next: None,
            })),
        })),
    };
    let _last = ll.head.unwrap().next.unwrap().current;
}
