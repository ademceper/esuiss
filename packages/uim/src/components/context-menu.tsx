import * as ContextMenuPrimitive from "@rn-primitives/context-menu"
import { Icon } from "@suiss/uim/components/icon"
import { NativeOnlyAnimatedView } from "@suiss/uim/components/native-only-animated-view"
import { TextClassContext } from "@suiss/uim/components/text"
import { cn } from "@suiss/uim/lib/utils"
import { CaretDown, CaretUp, Check } from "phosphor-react-native"
import * as React from "react"
import {
  Platform,
  type StyleProp,
  StyleSheet,
  Text,
  View,
  type ViewStyle,
} from "react-native"
import { FadeIn, ReduceMotion } from "react-native-reanimated"
import { FullWindowOverlay as RNFullWindowOverlay } from "react-native-screens"

const ContextMenu = ContextMenuPrimitive.Root
const ContextMenuTrigger = ContextMenuPrimitive.Trigger
const ContextMenuGroup = ContextMenuPrimitive.Group
const ContextMenuSub = ContextMenuPrimitive.Sub
const ContextMenuRadioGroup = ContextMenuPrimitive.RadioGroup

function ContextMenuSubTrigger({
  className,
  inset,
  children,
  iconClassName,
  ...props
}: React.ComponentProps<typeof ContextMenuPrimitive.SubTrigger> & {
  children?: React.ReactNode
  iconClassName?: string
  inset?: boolean
}) {
  const { open } = ContextMenuPrimitive.useSubContext()
  const icon = open ? CaretUp : CaretDown
  return (
    <TextClassContext.Provider
      value={cn(
        "select-none text-sm group-active:text-accent-foreground",
        open && "text-accent-foreground"
      )}
    >
      <ContextMenuPrimitive.SubTrigger
        className={cn(
          "group flex flex-row items-center rounded-sm px-2 py-2 active:bg-accent sm:py-1.5",
          className,
          open && cn("bg-accent", "mb-1"),
          inset && "pl-8"
        )}
        {...props}
      >
        <>{children}</>
        <Icon
          as={icon}
          className={cn(
            "ml-auto size-4 shrink-0 text-foreground",
            iconClassName
          )}
        />
      </ContextMenuPrimitive.SubTrigger>
    </TextClassContext.Provider>
  )
}

function ContextMenuSubContent({
  className,
  ...props
}: React.ComponentProps<typeof ContextMenuPrimitive.SubContent>) {
  return (
    <NativeOnlyAnimatedView entering={FadeIn.reduceMotion(ReduceMotion.System)}>
      <ContextMenuPrimitive.SubContent
        className={cn(
          "overflow-hidden rounded-md border border-border bg-popover p-1 shadow-black/5 shadow-lg",
          className
        )}
        {...props}
      />
    </NativeOnlyAnimatedView>
  )
}

const FullWindowOverlay =
  Platform.OS === "ios" ? RNFullWindowOverlay : React.Fragment

function ContextMenuContent({
  className,
  overlayClassName,
  overlayStyle,
  portalHost,
  ...props
}: React.ComponentProps<typeof ContextMenuPrimitive.Content> & {
  overlayStyle?: StyleProp<ViewStyle>
  overlayClassName?: string
  portalHost?: string
}) {
  return (
    <ContextMenuPrimitive.Portal hostName={portalHost}>
      <FullWindowOverlay>
        <ContextMenuPrimitive.Overlay
          style={
            overlayStyle
              ? StyleSheet.flatten([
                  StyleSheet.absoluteFill,
                  overlayStyle as typeof StyleSheet.absoluteFill,
                ])
              : StyleSheet.absoluteFill
          }
          className={overlayClassName}
          asChild
        >
          <NativeOnlyAnimatedView
            entering={FadeIn.reduceMotion(ReduceMotion.System)}
            as="Pressable"
          >
            <TextClassContext.Provider value="text-popover-foreground">
              <ContextMenuPrimitive.Content
                className={cn(
                  "min-w-[8rem] overflow-hidden rounded-md border border-border bg-popover p-1 shadow-black/5 shadow-lg",
                  className
                )}
                {...props}
              />
            </TextClassContext.Provider>
          </NativeOnlyAnimatedView>
        </ContextMenuPrimitive.Overlay>
      </FullWindowOverlay>
    </ContextMenuPrimitive.Portal>
  )
}

function ContextMenuItem({
  className,
  inset,
  variant,
  ...props
}: React.ComponentProps<typeof ContextMenuPrimitive.Item> & {
  className?: string
  inset?: boolean
  variant?: "default" | "destructive"
}) {
  return (
    <TextClassContext.Provider
      value={cn(
        "select-none text-popover-foreground text-sm group-active:text-popover-foreground",
        variant === "destructive" &&
          "text-destructive group-active:text-destructive"
      )}
    >
      <ContextMenuPrimitive.Item
        className={cn(
          "group relative flex flex-row items-center gap-2 rounded-sm px-2 py-2 active:bg-accent sm:py-1.5",
          variant === "destructive" &&
            "active:bg-destructive/10 dark:active:bg-destructive/20",
          props.disabled && "opacity-50",
          inset && "pl-8",
          className
        )}
        {...props}
      />
    </TextClassContext.Provider>
  )
}

function ContextMenuCheckboxItem({
  className,
  children,
  ...props
}: React.ComponentProps<typeof ContextMenuPrimitive.CheckboxItem> & {
  children?: React.ReactNode
}) {
  return (
    <TextClassContext.Provider value="text-sm text-popover-foreground select-none group-active:text-accent-foreground">
      <ContextMenuPrimitive.CheckboxItem
        className={cn(
          "group relative flex flex-row items-center gap-2 rounded-sm py-2 pr-2 pl-8 active:bg-accent sm:py-1.5",
          props.disabled && "opacity-50",
          className
        )}
        {...props}
      >
        <View className="absolute left-2 flex h-3.5 w-3.5 items-center justify-center">
          <ContextMenuPrimitive.ItemIndicator>
            <Icon as={Check} className={"size-4 text-foreground"} />
          </ContextMenuPrimitive.ItemIndicator>
        </View>
        <>{children}</>
      </ContextMenuPrimitive.CheckboxItem>
    </TextClassContext.Provider>
  )
}

function ContextMenuRadioItem({
  className,
  children,
  ...props
}: React.ComponentProps<typeof ContextMenuPrimitive.RadioItem> & {
  children?: React.ReactNode
}) {
  return (
    <TextClassContext.Provider value="text-sm text-popover-foreground select-none group-active:text-accent-foreground">
      <ContextMenuPrimitive.RadioItem
        className={cn(
          "group relative flex flex-row items-center gap-2 rounded-sm py-2 pr-2 pl-8 active:bg-accent sm:py-1.5",
          props.disabled && "opacity-50",
          className
        )}
        {...props}
      >
        <View className="absolute left-2 flex h-3.5 w-3.5 items-center justify-center">
          <ContextMenuPrimitive.ItemIndicator>
            <View className="h-2 w-2 rounded-full bg-foreground" />
          </ContextMenuPrimitive.ItemIndicator>
        </View>
        <>{children}</>
      </ContextMenuPrimitive.RadioItem>
    </TextClassContext.Provider>
  )
}

function ContextMenuLabel({
  className,
  inset,
  ...props
}: React.ComponentProps<typeof ContextMenuPrimitive.Label> & {
  className?: string
  inset?: boolean
}) {
  return (
    <ContextMenuPrimitive.Label
      className={cn(
        "px-2 py-2 font-medium text-foreground text-sm sm:py-1.5",
        inset && "pl-8",
        className
      )}
      {...props}
    />
  )
}

function ContextMenuSeparator({
  className,
  ...props
}: React.ComponentProps<typeof ContextMenuPrimitive.Separator>) {
  return (
    <ContextMenuPrimitive.Separator
      className={cn("-mx-1 my-1 h-px bg-border", className)}
      {...props}
    />
  )
}

function ContextMenuShortcut({
  className,
  ...props
}: React.ComponentProps<typeof Text>) {
  return (
    <Text
      className={cn(
        "ml-auto text-muted-foreground text-xs tracking-widest",
        className
      )}
      {...props}
    />
  )
}

export {
  ContextMenu,
  ContextMenuCheckboxItem,
  ContextMenuContent,
  ContextMenuGroup,
  ContextMenuItem,
  ContextMenuLabel,
  ContextMenuRadioGroup,
  ContextMenuRadioItem,
  ContextMenuSeparator,
  ContextMenuShortcut,
  ContextMenuSub,
  ContextMenuSubContent,
  ContextMenuSubTrigger,
  ContextMenuTrigger,
}
