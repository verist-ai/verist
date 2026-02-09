<script setup lang="ts">
import DefaultTheme from "vitepress/theme";
import StellarBackground from "./components/StellarBackground.vue";
import Comparison from "./components/home/Comparison.vue";
import HowItWorks from "./components/home/HowItWorks.vue";
import TerminalDemo from "./components/home/TerminalDemo.vue";

const { Layout } = DefaultTheme;
</script>

<template>
  <Layout>
    <template #home-hero-before>
      <StellarBackground />
    </template>
    <template #home-hero-image>
      <TerminalDemo />
    </template>
    <template #home-features-after>
      <HowItWorks />
      <Comparison />
    </template>
  </Layout>
</template>
