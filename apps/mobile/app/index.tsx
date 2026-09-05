import { Badge } from "@suiss/uim/components/badge"
import { Button } from "@suiss/uim/components/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@suiss/uim/components/card"
import { Progress } from "@suiss/uim/components/progress"
import { Separator } from "@suiss/uim/components/separator"
import { Text } from "@suiss/uim/components/text"
import { ScrollView, View } from "react-native"
import { useSafeAreaInsets } from "react-native-safe-area-context"

const transactions = [
  { id: "1", title: "Market alışverişi", amount: "-₺248,50", kind: "out" },
  { id: "2", title: "Maaş", amount: "+₺32.400,00", kind: "in" },
  { id: "3", title: "Fatura — elektrik", amount: "-₺612,75", kind: "out" },
]

export default function Home() {
  const insets = useSafeAreaInsets()

  return (
    <ScrollView
      className="bg-background flex-1"
      contentContainerClassName="gap-6 px-5 pb-10"
      style={{ paddingTop: insets.top + 16 }}
    >
      <View className="flex-row items-center justify-between">
        <View>
          <Text className="text-muted-foreground text-sm">Toplam bakiye</Text>
          <Text className="text-foreground text-4xl font-bold tabular-nums">
            ₺48.912,35
          </Text>
        </View>
        <Badge>
          <Text>Aktif</Text>
        </Badge>
      </View>

      <View className="flex-row gap-3">
        <Button className="flex-1">
          <Text>Para gönder</Text>
        </Button>
        <Button variant="outline" className="flex-1">
          <Text>Para iste</Text>
        </Button>
      </View>

      <Card>
        <CardHeader>
          <CardTitle>Aylık limit</CardTitle>
          <CardDescription>32.000 ₺ / 50.000 ₺ kullanıldı</CardDescription>
        </CardHeader>
        <CardContent className="gap-3">
          <Progress value={64} />
          <Text className="text-muted-foreground text-xs">
            Limitini yükseltmek için kimlik doğrulamanı tamamla.
          </Text>
        </CardContent>
      </Card>

      <View className="gap-3">
        <Text className="text-foreground text-lg font-semibold">
          Son işlemler
        </Text>
        <View className="border-border bg-card overflow-hidden rounded-xl border">
          {transactions.map((t, i) => (
            <View key={t.id}>
              {i > 0 ? <Separator /> : null}
              <View className="flex-row items-center justify-between px-4 py-3">
                <Text className="text-foreground">{t.title}</Text>
                <Text
                  className={
                    t.kind === "in"
                      ? "font-medium text-emerald-600 tabular-nums"
                      : "text-foreground font-medium tabular-nums"
                  }
                >
                  {t.amount}
                </Text>
              </View>
            </View>
          ))}
        </View>
      </View>
    </ScrollView>
  )
}
