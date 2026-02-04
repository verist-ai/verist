// https://vitepress.dev/guide/custom-theme
import type { Theme } from "vitepress";
import DefaultTheme from "vitepress/theme";
import { h } from "vue";
import "./style.css";

import GitAnalogy from "../../docs/components/GitAnalogy.vue";
import TerminalDemo from "../../docs/components/TerminalDemo.vue";
import UseCaseSpotlight from "../../docs/components/UseCaseSpotlight.vue";

export default {
  extends: DefaultTheme,
  Layout: () => {
    return h(DefaultTheme.Layout, null, {
      // https://vitepress.dev/guide/extending-default-theme#layout-slots
    });
  },
  enhanceApp({ app, router, siteData }) {
    app.component("TerminalDemo", TerminalDemo);
    app.component("GitAnalogy", GitAnalogy);
    app.component("UseCaseSpotlight", UseCaseSpotlight);
  },
} satisfies Theme;
