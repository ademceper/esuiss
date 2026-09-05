import { Button } from "@suiss/ui/components/button"
import { createFileRoute } from "@tanstack/react-router"

export const Route = createFileRoute("/")({ component: AdminHome })

function AdminHome() {
  return (
    <main className="mx-auto flex max-w-md flex-col gap-4 p-6 text-sm">
      <div>
        <h1 className="font-medium">suiss admin</h1>
        <p className="text-muted-foreground">
          Vite + React + TanStack Router. React Compiler açık, bileşenler{" "}
          <code className="font-mono text-xs">@suiss/ui</code> paketinden gelir.
        </p>
      </div>
      <Button className="self-start">Örnek buton</Button>
    </main>
  )
}
