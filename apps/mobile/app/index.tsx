import { Button } from "@suiss/uim/components/button"
import { Text } from "@suiss/uim/components/text"
import { View } from "react-native"
import { useSafeAreaInsets } from "react-native-safe-area-context"

export default function Home() {
  const insets = useSafeAreaInsets()

  return (
    <View
      className="flex-1 justify-center gap-4 bg-background px-6"
      style={{ paddingTop: insets.top, paddingBottom: insets.bottom }}
    >
      <Text variant="h1" className="text-left text-3xl">
        suiss
      </Text>
      <Text className="text-muted-foreground">
        Cüzdan uygulaması burada kurulacak.
      </Text>
      <Button>
        <Text>Başla</Text>
      </Button>
    </View>
  )
}
