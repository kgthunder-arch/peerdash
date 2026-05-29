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
        manualChunks: {
          "react-vendor": ["react", "react-dom"],
          "socket-vendor": ["socket.io-client"],
          "peer-vendor": ["peerjs"],
          "zip-vendor": ["jszip"],
        }
      }
    }
  }
});
