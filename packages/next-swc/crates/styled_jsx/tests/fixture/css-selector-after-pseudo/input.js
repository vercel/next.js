function NavigationItem({
  active,
  className,
}) {
  return (
    <span className={cn({ active }, className, 'navigation-item')}>
      <style jsx>{`
        .navigation-item :global(a)::after {
          content: attr(data-text);
          content: attr(data-text) / '';
          
        }
      `}</style>
    </span>
  );
}

export default NavigationItem;