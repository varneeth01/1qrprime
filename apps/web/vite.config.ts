import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: {
    allowedHosts: [".trycloudflare.com", ...(process.env.PREVIEW_HOST ? [process.env.PREVIEW_HOST] : [])],
    proxy: { "/api": "http://127.0.0.1:3001" },
  },
});
