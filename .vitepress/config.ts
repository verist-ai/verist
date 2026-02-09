import { defineConfig } from "vitepress";
import llmstxt from "vitepress-plugin-llms";

// https://vitepress.dev/reference/site-config
export default defineConfig({
  srcDir: "docs",
  cleanUrls: true,
  lastUpdated: true,

  sitemap: {
    hostname: "https://verist.dev",
    transformItems: (items) => {
      items.push({ url: "llms.txt" }, { url: "llms-full.txt" });
      return items;
    },
  },

  title: "Verist",
  appearance: "force-dark",
  description:
    "Replay + diff for AI decisions. Deterministic, audit-first workflow kernel for production AI systems.",

  head: [
    ["link", { rel: "icon", href: "/favicon.ico" }],
    ["link", { rel: "preconnect", href: "https://fonts.googleapis.com" }],
    [
      "link",
      {
        rel: "preconnect",
        href: "https://fonts.gstatic.com",
        crossorigin: "",
      },
    ],
    [
      "link",
      {
        rel: "stylesheet",
        href: "https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600&family=JetBrains+Mono:wght@400&family=Outfit:wght@600;800&display=swap",
      },
    ],
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
    [
      "link",
      {
        rel: "alternate",
        type: "text/plain",
        href: "/llms.txt",
        title: "LLM context",
      },
    ],
    [
      "link",
      {
        rel: "alternate",
        type: "text/plain",
        href: "/llms-full.txt",
        title: "LLM context (full)",
      },
    ],
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
    nav: [
      { text: "Home", link: "/" },
      { text: "Docs", link: "/guides/first-step" },
      { text: "Guides", link: "/guides/architecture" },
    ],

    sidebar: [
      { text: "Why Verist", link: "/why-verist" },
      {
        text: "Getting Started",
        collapsed: false,
        items: [
          { text: "First Step", link: "/guides/first-step" },
          { text: "Core Concepts", link: "/concepts/overview" },
          { text: "Mental Map", link: "/guides/mental-map" },
          { text: "Complete Guide", link: "/getting-started" },
        ],
      },
      {
        text: "Guides",
        collapsed: false,
        items: [
          { text: "Architecture Overview", link: "/guides/architecture" },
          { text: "Replay and Diff", link: "/guides/replay-and-diff" },
          { text: "Workflows", link: "/guides/workflows" },
          { text: "Storage and State", link: "/guides/storage" },
          { text: "Human Overrides", link: "/guides/overrides" },
          { text: "Error Handling", link: "/guides/errors" },
          { text: "Batch Runs", link: "/guides/batch" },
          { text: "Suspend and Resume", link: "/guides/suspend-resume" },
          { text: "Pipelines", link: "/guides/pipeline" },
          { text: "Anti-Patterns", link: "/guides/anti-patterns" },
        ],
      },
      {
        text: "Integrations",
        collapsed: false,
        items: [
          { text: "Overview", link: "/integrations/" },
          { text: "LangExtract", link: "/integrations/langextract" },
        ],
      },
      { text: "FAQ", link: "/faq" },
      { text: "Glossary", link: "/glossary" },
    ],

    socialLinks: [
      { icon: "github", link: "https://github.com/verist-ai/verist" },
      { icon: "x", link: "https://x.com/verist_ai" },
      {
        icon: "bluesky",
        link: "https://bsky.app/profile/verist.dev",
      },
    ],

    editLink: {
      pattern: "https://github.com/verist-ai/verist/edit/main/docs/:path",
    },

    footer: {
      message:
        'LLM context: <a href="/llms.txt">llms.txt</a> · <a href="/llms-full.txt">llms-full.txt</a><br>Released under the Apache 2.0 License.',
      copyright: "Copyright © 2025 Verist Authors",
    },

    search: {
      provider: "local",
    },
  },

  vite: {
    publicDir: "../.vitepress/public",
    plugins: [llmstxt()],
  },
});
