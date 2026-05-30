import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173
  },
  build: {
    chunkSizeWarningLimit: 1000,
    rollupOptions: {
      output: {
        manualChunks: (id) => {
          if (id.includes("node_modules/react") || id.includes("node_modules/react-dom")) return "react-vendor";
          if (id.includes("node_modules/socket.io-client")) return "socket-vendor";
          if (id.includes("node_modules/peerjs")) return "peer-vendor";
          if (id.includes("node_modules/jszip")) return "zip-vendor";
        }
      }
    }
  }
});
