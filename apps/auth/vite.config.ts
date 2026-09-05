import tailwindcss from "@tailwindcss/vite"
import react from "@vitejs/plugin-react"
import { keycloakify } from "keycloakify/vite-plugin"
import { defineConfig } from "vite"

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    keycloakify({
      themeName: "suiss",
      accountThemeImplementation: "Single-Page",
    }),
  ],
})
