import { Outlet, createRootRoute } from "@tanstack/react-router"

export const Route = createRootRoute({ component: RootLayout })

function RootLayout() {
  return (
    <div className="bg-background text-foreground min-h-svh">
      <Outlet />
    </div>
  )
}
