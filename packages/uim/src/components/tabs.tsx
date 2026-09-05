import * as TabsPrimitive from "@rn-primitives/tabs"
import { TextClassContext } from "@suiss/uim/components/text"
import { cn } from "@suiss/uim/lib/utils"

function Tabs({
  className,
  ...props
}: React.ComponentProps<typeof TabsPrimitive.Root>) {
  return (
    <TabsPrimitive.Root
      className={cn("flex flex-col gap-2", className)}
      {...props}
    />
  )
}

function TabsList({
  className,
  ...props
}: React.ComponentProps<typeof TabsPrimitive.List>) {
  return (
    <TabsPrimitive.List
      className={cn(
        "bg-muted flex h-9 flex-row items-center justify-center rounded-lg p-[3px]",
        "mr-auto",
        className
      )}
      {...props}
    />
  )
}

function TabsTrigger({
  className,
  ...props
}: React.ComponentProps<typeof TabsPrimitive.Trigger>) {
  const { value } = TabsPrimitive.useRootContext()
  return (
    <TextClassContext.Provider
      value={cn(
        "text-foreground dark:text-muted-foreground text-sm font-medium",
        value === props.value && "dark:text-foreground"
      )}
    >
      <TabsPrimitive.Trigger
        className={cn(
          "flex h-[calc(100%-1px)] flex-row items-center justify-center gap-1.5 rounded-md border border-transparent px-2 py-1 shadow-none shadow-black/5",
          props.disabled && "opacity-50",
          props.value === value &&
            "bg-background dark:border-foreground/10 dark:bg-input/30",
          className
        )}
        {...props}
      />
    </TextClassContext.Provider>
  )
}

function TabsContent({
  className,
  ...props
}: React.ComponentProps<typeof TabsPrimitive.Content>) {
  return <TabsPrimitive.Content className={cn(className)} {...props} />
}

export { Tabs, TabsContent, TabsList, TabsTrigger }
