import { defineConfig } from "vite"
import react from "@vitejs/plugin-react"
import tailwindcss from "@tailwindcss/vite"
import path from "node:path"

export default defineConfig({
  root: "src/web",
  plugins: [react(), tailwindcss()],
  resolve: { alias: { "@": path.resolve(import.meta.dirname, "src/web") } },
  server: { port: 5173, proxy: { "/api/": `http://localhost:${process.env.API_PORT ?? 8787}` } },
  build: { outDir: "../../dist", emptyOutDir: true },
})
