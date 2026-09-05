import * as ToggleGroupPrimitive from "@rn-primitives/toggle-group"
import { Icon } from "@suiss/uim/components/icon"
import { TextClassContext } from "@suiss/uim/components/text"
import { toggleVariants } from "@suiss/uim/components/toggle"
import { cn } from "@suiss/uim/lib/utils"
import type { VariantProps } from "class-variance-authority"
import * as React from "react"

const ToggleGroupContext = React.createContext<VariantProps<
  typeof toggleVariants
> | null>(null)

function ToggleGroup({
  className,
  variant,
  size,
  children,
  ...props
}: React.ComponentProps<typeof ToggleGroupPrimitive.Root> &
  VariantProps<typeof toggleVariants>) {
  return (
    <ToggleGroupPrimitive.Root
      className={cn(
        "flex flex-row items-center rounded-md shadow-none",
        variant === "outline" && "shadow-black/5 shadow-sm",
        className
      )}
      {...props}
    >
      <ToggleGroupContext.Provider value={{ variant, size }}>
        {children}
      </ToggleGroupContext.Provider>
    </ToggleGroupPrimitive.Root>
  )
}

function useToggleGroupContext() {
  const context = React.useContext(ToggleGroupContext)
  if (context === null) {
    throw new Error(
      "ToggleGroup compound components cannot be rendered outside the ToggleGroup component"
    )
  }
  return context
}

function ToggleGroupItem({
  className,
  children,
  variant,
  size,
  isFirst,
  isLast,
  ...props
}: React.ComponentProps<typeof ToggleGroupPrimitive.Item> &
  VariantProps<typeof toggleVariants> & {
    isFirst?: boolean
    isLast?: boolean
  }) {
  const context = useToggleGroupContext()
  const { value } = ToggleGroupPrimitive.useRootContext()

  return (
    <TextClassContext.Provider
      value={cn(
        "font-medium text-foreground text-sm",
        ToggleGroupPrimitive.utils.getIsSelected(value, props.value) &&
          "text-accent-foreground"
      )}
    >
      <ToggleGroupPrimitive.Item
        className={cn(
          toggleVariants({
            variant: context.variant || variant,
            size: context.size || size,
          }),
          props.disabled && "opacity-50",
          ToggleGroupPrimitive.utils.getIsSelected(value, props.value) &&
            "bg-accent",
          "min-w-0 shrink-0 rounded-none shadow-none",
          isFirst && "rounded-l-md",
          isLast && "rounded-r-md",
          (context.variant === "outline" || variant === "outline") &&
            "border-l-0",
          (context.variant === "outline" || variant === "outline") &&
            isFirst &&
            "border-l",
          className
        )}
        {...props}
      >
        {children}
      </ToggleGroupPrimitive.Item>
    </TextClassContext.Provider>
  )
}

function ToggleGroupIcon({
  className,
  ...props
}: React.ComponentProps<typeof Icon>) {
  const textClass = React.useContext(TextClassContext)
  return (
    <Icon className={cn("size-4 shrink-0", textClass, className)} {...props} />
  )
}

export { ToggleGroup, ToggleGroupIcon, ToggleGroupItem }
