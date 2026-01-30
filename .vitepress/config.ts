import { defineConfig } from "vitepress";

// https://vitepress.dev/reference/site-config
export default defineConfig({
  srcDir: "docs",
  cleanUrls: true,
  lastUpdated: true,

  sitemap: {
    hostname: "https://verist.dev",
  },

  title: "Verist",
  description:
    "Replay + diff for AI decisions. Deterministic, audit-first workflow kernel for production AI systems.",

  head: [
    ["link", { rel: "icon", href: "/favicon.ico" }],
    [
      "meta",
      { name: "msvalidate.01", content: "7FD66972397F9CE88FEB4B2FA2B3D379" },
    ],
    [
      "meta",
      {
        property: "og:title",
        content: "Verist — Replay + diff for AI decisions",
      },
    ],
    [
      "meta",
      {
        property: "og:description",
        content:
          "Deterministic, audit-first workflow kernel for production AI systems.",
      },
    ],
    ["meta", { property: "og:type", content: "website" }],
    ["meta", { name: "twitter:card", content: "summary" }],
    [
      "meta",
      {
        name: "twitter:title",
        content: "Verist — Replay + diff for AI decisions",
      },
    ],
    [
      "meta",
      {
        name: "twitter:description",
        content:
          "Deterministic, audit-first workflow kernel for production AI systems.",
      },
    ],
  ],

  themeConfig: {
    nav: [{ text: "Docs", link: "/why-verist" }],

    sidebar: [
      { text: "Why Verist", link: "/why-verist" },
      { text: "Getting Started", link: "/getting-started" },
    ],

    socialLinks: [
      { icon: "github", link: "https://github.com/verist-ai/verist" },
      { icon: "x", link: "https://x.com/verist_ai" },
    ],

    editLink: {
      pattern: "https://github.com/verist-ai/verist/edit/main/docs/:path",
    },

    search: {
      provider: "local",
    },
  },

  vite: {
    publicDir: "../.vitepress/public",
  },
});
