import { cn } from "@suiss/uim/lib/utils"
import { TextInput } from "react-native"

function Input({
  className,
  ...props
}: React.ComponentProps<typeof TextInput> & React.RefAttributes<TextInput>) {
  return (
    <TextInput
      className={cn(
        "flex h-10 w-full min-w-0 flex-row items-center rounded-md border border-input bg-background px-3 py-1 text-base text-foreground leading-5 shadow-black/5 shadow-sm sm:h-9 dark:bg-input/30",
        props.editable === false && "opacity-50",
        "placeholder:text-muted-foreground/50",
        className
      )}
      {...props}
    />
  )
}

export { Input }
