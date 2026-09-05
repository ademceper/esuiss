import * as HoverCardPrimitive from "@rn-primitives/hover-card"
import { NativeOnlyAnimatedView } from "@suiss/uim/components/native-only-animated-view"
import { TextClassContext } from "@suiss/uim/components/text"
import { cn } from "@suiss/uim/lib/utils"
import * as React from "react"
import { Platform, StyleSheet } from "react-native"
import { FadeIn, FadeOut, ReduceMotion } from "react-native-reanimated"
import { FullWindowOverlay as RNFullWindowOverlay } from "react-native-screens"

const HoverCard = HoverCardPrimitive.Root

const HoverCardTrigger = HoverCardPrimitive.Trigger

const FullWindowOverlay =
  Platform.OS === "ios" ? RNFullWindowOverlay : React.Fragment

function HoverCardContent({
  className,
  align = "center",
  sideOffset = 4,
  ...props
}: React.ComponentProps<typeof HoverCardPrimitive.Content>) {
  return (
    <HoverCardPrimitive.Portal>
      <FullWindowOverlay>
        <HoverCardPrimitive.Overlay style={StyleSheet.absoluteFill} asChild>
          <NativeOnlyAnimatedView
            entering={FadeIn.reduceMotion(ReduceMotion.System)}
            exiting={FadeOut.reduceMotion(ReduceMotion.System)}
            as="Pressable"
          >
            <TextClassContext.Provider value="text-popover-foreground">
              <HoverCardPrimitive.Content
                align={align}
                sideOffset={sideOffset}
                className={cn(
                  "z-50 w-64 rounded-md border border-border bg-popover p-4 shadow-black/5 shadow-md outline-hidden",
                  className
                )}
                {...props}
              />
            </TextClassContext.Provider>
          </NativeOnlyAnimatedView>
        </HoverCardPrimitive.Overlay>
      </FullWindowOverlay>
    </HoverCardPrimitive.Portal>
  )
}

export { HoverCard, HoverCardContent, HoverCardTrigger }
