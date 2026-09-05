import * as CheckboxPrimitive from "@rn-primitives/checkbox"
import { Icon } from "@suiss/uim/components/icon"
import { cn } from "@suiss/uim/lib/utils"
import { Check } from "phosphor-react-native"

const DEFAULT_HIT_SLOP = 24

function Checkbox({
  className,
  checkedClassName,
  indicatorClassName,
  iconClassName,
  ...props
}: React.ComponentProps<typeof CheckboxPrimitive.Root> & {
  checkedClassName?: string
  indicatorClassName?: string
  iconClassName?: string
}) {
  return (
    <CheckboxPrimitive.Root
      className={cn(
        "size-4 shrink-0 rounded-[4px] border border-input shadow-black/5 shadow-sm dark:bg-input/30",
        "overflow-hidden",
        props.checked && cn("border-primary", checkedClassName),
        props.disabled && "opacity-50",
        className
      )}
      hitSlop={DEFAULT_HIT_SLOP}
      {...props}
    >
      <CheckboxPrimitive.Indicator
        className={cn(
          "h-full w-full items-center justify-center bg-primary",
          indicatorClassName
        )}
      >
        <Icon
          as={Check}
          size={12}
          weight="bold"
          className={cn("text-primary-foreground", iconClassName)}
        />
      </CheckboxPrimitive.Indicator>
    </CheckboxPrimitive.Root>
  )
}

export { Checkbox }
