import * as SelectPrimitive from "@rn-primitives/select"
import { Icon } from "@suiss/uim/components/icon"
import { NativeOnlyAnimatedView } from "@suiss/uim/components/native-only-animated-view"
import { TextClassContext } from "@suiss/uim/components/text"
import { cn } from "@suiss/uim/lib/utils"
import { CaretDown, Check } from "phosphor-react-native"
import * as React from "react"
import { Platform, StyleSheet, View } from "react-native"
import { FadeIn, FadeOut, ReduceMotion } from "react-native-reanimated"
import { FullWindowOverlay as RNFullWindowOverlay } from "react-native-screens"

type Option = SelectPrimitive.Option

const Select = SelectPrimitive.Root

const SelectGroup = SelectPrimitive.Group

function SelectValue({
  ref,
  className,
  ...props
}: React.ComponentProps<typeof SelectPrimitive.Value> & {
  className?: string
}) {
  const { value } = SelectPrimitive.useRootContext()
  return (
    <SelectPrimitive.Value
      ref={ref}
      className={cn(
        "line-clamp-1 flex flex-row items-center gap-2 text-foreground text-sm",
        !value && "text-muted-foreground",
        className
      )}
      {...props}
    />
  )
}

function SelectTrigger({
  ref,
  className,
  children,
  size = "default",
  ...props
}: React.ComponentProps<typeof SelectPrimitive.Trigger> & {
  children?: React.ReactNode
  size?: "default" | "sm"
}) {
  return (
    <SelectPrimitive.Trigger
      ref={ref}
      className={cn(
        "flex h-10 flex-row items-center justify-between gap-2 rounded-md border border-input bg-background px-3 py-2 shadow-black/5 shadow-sm sm:h-9 dark:bg-input/30 dark:active:bg-input/50",
        props.disabled && "opacity-50",
        size === "sm" && "h-8 py-2 sm:py-1.5",
        className
      )}
      {...props}
    >
      <>{children}</>
      <Icon
        as={CaretDown}
        aria-hidden={true}
        className="size-4 text-muted-foreground"
      />
    </SelectPrimitive.Trigger>
  )
}

const FullWindowOverlay =
  Platform.OS === "ios" ? RNFullWindowOverlay : React.Fragment

function SelectContent({
  className,
  children,
  position = "popper",
  portalHost,
  ...props
}: React.ComponentProps<typeof SelectPrimitive.Content> & {
  className?: string
  portalHost?: string
}) {
  return (
    <SelectPrimitive.Portal hostName={portalHost}>
      <FullWindowOverlay>
        <SelectPrimitive.Overlay style={StyleSheet.absoluteFill} asChild>
          <NativeOnlyAnimatedView
            className="z-50"
            entering={FadeIn.reduceMotion(ReduceMotion.System)}
            exiting={FadeOut.reduceMotion(ReduceMotion.System)}
            as="Pressable"
          >
            <TextClassContext.Provider value="text-popover-foreground">
              <SelectPrimitive.Content
                className={cn(
                  "relative z-50 min-w-[8rem] rounded-md border border-border bg-popover shadow-black/5 shadow-md",
                  "p-1",
                  position === "popper" && className
                )}
                position={position}
                {...props}
              >
                <SelectPrimitive.Viewport
                  className={cn("p-1", position === "popper" && "w-full")}
                >
                  {children}
                </SelectPrimitive.Viewport>
              </SelectPrimitive.Content>
            </TextClassContext.Provider>
          </NativeOnlyAnimatedView>
        </SelectPrimitive.Overlay>
      </FullWindowOverlay>
    </SelectPrimitive.Portal>
  )
}

function SelectLabel({
  className,
  ...props
}: React.ComponentProps<typeof SelectPrimitive.Label>) {
  return (
    <SelectPrimitive.Label
      className={cn(
        "px-2 py-2 text-muted-foreground text-xs sm:py-1.5",
        className
      )}
      {...props}
    />
  )
}

function SelectItem({
  className,
  children,
  ...props
}: React.ComponentProps<typeof SelectPrimitive.Item>) {
  return (
    <SelectPrimitive.Item
      className={cn(
        "group relative flex w-full flex-row items-center gap-2 rounded-sm py-2 pr-8 pl-2 active:bg-accent sm:py-1.5",
        props.disabled && "opacity-50",
        className
      )}
      {...props}
    >
      <View className="absolute right-2 flex size-3.5 items-center justify-center">
        <SelectPrimitive.ItemIndicator>
          <Icon as={Check} className="size-4 shrink-0 text-muted-foreground" />
        </SelectPrimitive.ItemIndicator>
      </View>
      <SelectPrimitive.ItemText className="select-none text-foreground text-sm group-active:text-accent-foreground" />
    </SelectPrimitive.Item>
  )
}

function SelectSeparator({
  className,
  ...props
}: React.ComponentProps<typeof SelectPrimitive.Separator>) {
  return (
    <SelectPrimitive.Separator
      className={cn("-mx-1 my-1 h-px bg-border", className)}
      {...props}
    />
  )
}

export {
  type Option,
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectSeparator,
  SelectTrigger,
  SelectValue,
}
