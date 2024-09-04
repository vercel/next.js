use turbo_tasks::ResolvedValue;

#[derive(ResolvedValue)]
// use an inline type constraint here
struct LinkedList<T: ResolvedValue> {
    // LinkedListNode is also a ResolvedValue
    head: Option<Box<LinkedListNode<T>>>,
}

#[derive(ResolvedValue)]
struct LinkedListNode<T>
where
    T: ResolvedValue, // use a where type constraint here
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
