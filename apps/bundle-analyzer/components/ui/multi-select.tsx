'use client'

import * as React from 'react'
import { Button } from '@/components/ui/button'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover'
import { ChevronDown, CheckIcon } from 'lucide-react'
import { cn } from '@/lib/utils'

export interface MultiSelectPropOption {
  value: string
  label: string
  icon?: React.ReactNode
}

interface MultiSelectProps {
  options: MultiSelectPropOption[]
  value: string[]
  onValueChange: (value: string[]) => void
  placeholder?: string
  emptyMessage?: string
  selectionName?: {
    singular: string
    plural: string
  }
  className?: string
  triggerClassName?: string
  triggerIcon?: React.ReactNode
  'aria-label'?: string
  size?: 'sm' | 'default'
}

export function MultiSelect({
  options,
  value,
  onValueChange,
  placeholder = 'Select items...',
  selectionName = {
    singular: 'item',
    plural: 'items',
  },
  className,
  triggerClassName,
  triggerIcon,
  'aria-label': ariaLabel,
}: MultiSelectProps) {
  const [open, setOpen] = React.useState(false)

  function handleToggle(optionValue: string, checked: boolean) {
    const newValue = checked
      ? [...value, optionValue]
      : value.filter((v) => v !== optionValue)
    if (newValue.length > 0) {
      onValueChange(newValue)
    }
  }

  let displayText: string
  if (value.length === options.length) {
    displayText = `All ${selectionName.plural}`
  } else if (value.length === 0) {
    displayText = placeholder
  } else {
    displayText = `${value.length} ${value.length === 1 ? selectionName.singular : selectionName.plural}`
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          className={cn(
            'justify-between border focus-visible:ring-[3px] focus-visible:ring-ring/50 font-normal px-3 py-2 h-9 text-xs',
            triggerClassName
          )}
          role="combobox"
          aria-expanded={open}
          aria-haspopup="dialog"
          aria-label={ariaLabel}
          onKeyDown={(e) => {
            if ((e.key === 'ArrowDown' || e.key === 'ArrowUp') && !open) {
              e.preventDefault()
              setOpen(true)
            }
          }}
        >
          <div className="flex items-center gap-1">
            {triggerIcon && (
              <span
                className="shrink-0 text-muted-foreground"
                aria-hidden="true"
              >
                {triggerIcon}
              </span>
            )}
            <span>{displayText}</span>
          </div>
          <ChevronDown className="h-3.5 w-3.5 opacity-50" aria-hidden="true" />
        </Button>
      </PopoverTrigger>
      <PopoverContent
        className={cn('w-48 p-2', className)}
        align="end"
        onKeyDown={(e) => {
          if (e.key === 'Escape') {
            e.preventDefault()
            setOpen(false)
            return
          }

          const checkboxes = Array.from(
            e.currentTarget.querySelectorAll('input[type="checkbox"]')
          ) as HTMLInputElement[]
          const currentIndex = checkboxes.indexOf(
            document.activeElement as HTMLInputElement
          )

          if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
            e.preventDefault()
            if (currentIndex === -1) {
              checkboxes[0]?.focus()
            } else {
              const nextIndex =
                e.key === 'ArrowDown'
                  ? (currentIndex + 1) % checkboxes.length
                  : (currentIndex - 1 + checkboxes.length) % checkboxes.length
              checkboxes[nextIndex]?.focus()
            }
          }
        }}
      >
        <fieldset className="space-y-2">
          <legend className="sr-only">{ariaLabel || placeholder}</legend>
          {options.map((option) => (
            <MultiSelectOption
              key={option.value}
              label={option.label}
              icon={option.icon}
              checked={value.includes(option.value)}
              onChange={(checked) => handleToggle(option.value, checked)}
            />
          ))}
        </fieldset>
      </PopoverContent>
    </Popover>
  )
}

function MultiSelectOption({
  label,
  icon,
  checked,
  onChange,
}: {
  label: string
  icon?: React.ReactNode
  checked: boolean
  onChange: (checked: boolean) => void
}) {
  return (
    <label
      className={cn(
        "text-xs hover:bg-accent hover:text-accent-foreground has-[input:focus-visible]:bg-accent has-[input:focus-visible]:text-accent-foreground [&_svg:not([class*='text-'])]:text-muted-foreground relative flex w-full cursor-default items-center gap-2 rounded-sm py-1.5 pr-8 pl-2 select-none outline-hidden [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4"
      )}
    >
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="sr-only peer focus:outline-hidden focus-visible:outline-2"
        aria-label={label}
      />
      {icon && (
        <span className="shrink-0" aria-hidden="true">
          {icon}
        </span>
      )}
      <span className="flex items-center gap-2">{label}</span>
      <span className="absolute right-2 flex size-3.5 items-center justify-center">
        {checked && <CheckIcon className="size-4" />}
      </span>
    </label>
  )
}
