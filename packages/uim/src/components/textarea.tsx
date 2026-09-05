import { cn } from "@suiss/uim/lib/utils"
import { TextInput } from "react-native"

function Textarea({
  className,
  multiline = true,
  numberOfLines = 8, // On web, numberOfLines also determines initial height. On native, it determines the maximum height.
  placeholderClassName,
  ...props
}: React.ComponentProps<typeof TextInput> & React.RefAttributes<TextInput>) {
  return (
    <TextInput
      className={cn(
        "flex min-h-16 w-full flex-row rounded-md border border-input bg-transparent px-3 py-2 text-base text-foreground shadow-black/5 shadow-sm md:text-sm dark:bg-input/30",
        props.editable === false && "opacity-50",
        className
      )}
      placeholderClassName={cn("text-muted-foreground", placeholderClassName)}
      multiline={multiline}
      numberOfLines={numberOfLines}
      textAlignVertical="top"
      {...props}
    />
  )
}

export { Textarea }
