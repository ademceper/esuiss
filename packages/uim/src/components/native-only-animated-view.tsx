import { Pressable } from "react-native"
import Animated from "react-native-reanimated"

const AnimatedPressable = Animated.createAnimatedComponent(Pressable)

/**
 * Wraps animated views. Renders an animated Pressable when `as` is "Pressable",
 * otherwise an animated View.
 * @param props - The props for the animated view.
 * @example
 * <NativeOnlyAnimatedView entering={FadeIn} exiting={FadeOut}>
 *   <Text>I am only animated on native</Text>
 * </NativeOnlyAnimatedView>
 */
function NativeOnlyAnimatedView(
  props:
    | (React.ComponentProps<typeof Animated.View> &
        React.RefAttributes<typeof Animated.View> & { as?: "View" })
    | (React.ComponentProps<typeof AnimatedPressable> &
        React.RefAttributes<typeof AnimatedPressable> & { as: "Pressable" })
) {
  if (props.as === "Pressable") {
    return <AnimatedPressable {...props} />
  }
  return <Animated.View {...props} />
}

export { NativeOnlyAnimatedView }
