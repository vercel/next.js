# {{title}} API Reference

{{#each apis}}

## {{type}}: `{{name}}`

### Import

```typescript
{
  {
    import_statement
  }
}
```

### Signature

```typescript
{
  {
    signature
  }
}
```

### Parameters

| Parameter | Type | Description | Default |
| --------- | ---- | ----------- | ------- |

{{#each parameters}}
| `{{name}}` | `{{type}}` | {{description}} | {{default}} |
{{/each}}

### Return Value

{{return_description}}

### Rules

{{#each rules}}
{{@index}}. {{this}}
{{/each}}

### Examples

{{#each examples}}

```{{language}}
{{code}}
```

{{/each}}

---

{{/each}}
