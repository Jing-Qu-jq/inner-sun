import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],

  // The API serves this bundle at /admin, so asset URLs must be built with that prefix.
  base: "/admin/",

  server: {
    port: 3002,
    // Only used by `npm run dev` in this workspace. The admin app normally runs from the
    // API's own origin (built once, served at /admin), which is what production does and
    // what makes the session cookie work without any cross-site handling. This proxy
    // exists so the same relative /admin/api paths also work during UI iteration.
    proxy: {
      "/admin/api": {
        target: "http://localhost:3001",
        changeOrigin: false,
      },
    },
  },
});
