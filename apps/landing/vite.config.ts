import path from "node:path";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [
    react(),
    {
      name: "learn-route-rewrite",
      configureServer(server) {
        server.middlewares.use((req, _res, next) => {
          if (req.url === "/learn" || req.url === "/learn/") {
            req.url = "/learn.html";
          }
          next();
        });
      },
    },
  ],
  build: {
    rollupOptions: {
      input: {
        main: path.resolve(__dirname, "index.html"),
        learn: path.resolve(__dirname, "learn.html"),
      },
    },
  },
  server: {
    host: "127.0.0.1",
    port: 8092,
  },
  preview: {
    host: "127.0.0.1",
    port: 8093,
  },
});
