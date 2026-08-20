import { defineConfig } from "vite";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import viteReact from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
  base: "/toyota-dashboard/",
  resolve: { tsconfigPaths: true },
  plugins: [
    tailwindcss(),
    tanstackStart({
      spa: {
        enabled: true,
        prerender: { crawlLinks: true },
      },
      prerender: {
        failOnError: false,
        autoSubfolderIndex: true,
      },
      pages: [
        { path: "/" },
        { path: "/vehicles" },
        { path: "/drivers" },
        { path: "/fuel" },
        { path: "/maintenance" },
        { path: "/performance" },
        { path: "/alerts" },
        { path: "/notes" },
        { path: "/follow-ups" },
        { path: "/ros" },
        { path: "/settings" },
        { path: "/login" },
        { path: "/fleet" },
        { path: "/fleet/vehicles" },
        { path: "/fleet/drivers" },
        { path: "/fleet/fuel" },
        { path: "/fleet/maintenance" },
        { path: "/fleet/alerts" },
        { path: "/fleet/settings" },
      ],
    }),
    viteReact(),
  ],
});
