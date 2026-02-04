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
  appearance: "force-dark",
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
    nav: [
      { text: "Home", link: "/" },
      { text: "Docs", link: "/guides/first-step" },
      { text: "Guides", link: "/guides/architecture" },
      { text: "Reference", link: "/specs/overview" },
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
      { text: "FAQ", link: "/faq" },
      { text: "Glossary", link: "/glossary" },
      {
        text: "Reference",
        collapsed: true,
        items: [
          { text: "Overview", link: "/specs/overview" },
          { text: "Commands", link: "/specs/commands" },
          { text: "Replay", link: "/specs/replay" },
          { text: "Pipeline", link: "/specs/pipeline" },
          { text: "Batch", link: "/specs/batch" },
          { text: "Suspend", link: "/specs/suspend" },
          { text: "Kernel Invariants", link: "/specs/kernel-invariants" },
        ],
      },
      {
        text: "Architecture Decisions",
        collapsed: true,
        items: [
          { text: "ADR-001 Determinism", link: "/adr/001-determinism" },
          { text: "ADR-002 Commands", link: "/adr/002-commands" },
          { text: "ADR-003 State Layers", link: "/adr/003-state-layers" },
          {
            text: "ADR-004 Replay Semantics",
            link: "/adr/004-replay-semantics",
          },
          {
            text: "ADR-005 Package Stability",
            link: "/adr/005-package-stability",
          },
          {
            text: "ADR-006 Command Categories",
            link: "/adr/006-command-categories",
          },
          { text: "ADR-007 Unified Run API", link: "/adr/007-unified-run-api" },
          {
            text: "ADR-008 Artifact Capture",
            link: "/adr/008-artifact-capture-hook",
          },
          {
            text: "ADR-009 Pipeline Errors",
            link: "/adr/009-pipeline-error-handling",
          },
        ],
      },
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

    search: {
      provider: "local",
    },
  },

  vite: {
    publicDir: "../.vitepress/public",
  },
});
