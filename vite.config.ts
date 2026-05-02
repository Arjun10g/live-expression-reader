import { defineConfig } from "vite";

export default defineConfig({
  base: "./",
  build: {
    target: "es2022",
    outDir: "dist",
  },
  server: {
    host: "127.0.0.1",
    port: 5173,
  },
});
