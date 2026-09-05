import * as TogglePrimitive from "@rn-primitives/toggle"
import { Icon } from "@suiss/uim/components/icon"
import { TextClassContext } from "@suiss/uim/components/text"
import { cn } from "@suiss/uim/lib/utils"
import { cva, type VariantProps } from "class-variance-authority"
import * as React from "react"

const toggleVariants = cva(
  cn(
    "active:bg-muted group flex flex-row items-center justify-center gap-2 rounded-md"
  ),
  {
    variants: {
      variant: {
        default: "bg-transparent",
        outline: cn(
          "border-input active:bg-accent border bg-transparent shadow-sm shadow-black/5"
        ),
      },
      size: {
        default: "h-10 min-w-10 px-2.5 sm:h-9 sm:min-w-9 sm:px-2",
        sm: "h-9 min-w-9 px-2 sm:h-8 sm:min-w-8 sm:px-1.5",
        lg: "h-11 min-w-11 px-3 sm:h-10 sm:min-w-10 sm:px-2.5",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
)

function Toggle({
  className,
  variant,
  size,
  ...props
}: React.ComponentProps<typeof TogglePrimitive.Root> &
  VariantProps<typeof toggleVariants>) {
  return (
    <TextClassContext.Provider
      value={cn(
        "text-sm text-foreground font-medium",
        props.pressed ? "text-accent-foreground" : className
      )}
    >
      <TogglePrimitive.Root
        className={cn(
          toggleVariants({ variant, size }),
          props.disabled && "opacity-50",
          props.pressed && "bg-accent",
          className
        )}
        {...props}
      />
    </TextClassContext.Provider>
  )
}

function ToggleIcon({
  className,
  ...props
}: React.ComponentProps<typeof Icon>) {
  const textClass = React.useContext(TextClassContext)
  return (
    <Icon className={cn("size-4 shrink-0", textClass, className)} {...props} />
  )
}

export { Toggle, ToggleIcon, toggleVariants }
