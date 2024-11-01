import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  // FIXME needed for github.io setup
  base: '/pumpjack/'
});
