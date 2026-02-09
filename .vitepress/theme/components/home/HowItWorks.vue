<script setup lang="ts">
const steps = [
  {
    title: "Capture",
    desc: "Run a step, store output as a versioned artifact.",
  },
  {
    title: "Recompute",
    desc: "Re-run with a new prompt or model against the same inputs.",
  },
  {
    title: "Diff",
    desc: "See exactly which fields changed, were added, or removed.",
  },
  {
    title: "Approve",
    desc: "Review the impact, then ship with confidence.",
  },
];
</script>

<template>
  <section class="how-it-works">
    <div class="how-inner">
      <h2 class="how-heading">How it works</h2>
      <p class="how-sub">
        change prompt → recompute → see diff → approve → ship
      </p>
      <div class="how-grid">
        <div v-for="(step, i) in steps" :key="i" class="how-step">
          <span class="step-num">{{ i + 1 }}</span>
          <h3 class="step-title">{{ step.title }}</h3>
          <p class="step-desc">{{ step.desc }}</p>
        </div>
      </div>
    </div>
  </section>
</template>

<style scoped>
.how-it-works {
  padding: 64px 24px;
}

.how-inner {
  max-width: 1152px;
  margin: 0 auto;
  text-align: center;
}

.how-heading {
  font-size: 28px;
  font-weight: 600;
  color: var(--vp-c-text-1);
}

.how-sub {
  margin-top: 8px;
  font-family: var(--vp-font-family-mono);
  font-size: 14px;
  color: var(--vp-c-text-3);
}

.how-grid {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 24px;
  margin-top: 40px;
  text-align: left;
}

.how-step {
  padding: 24px;
  border-radius: 12px;
  border: 1px solid var(--vp-c-divider);
  background: rgba(255, 255, 255, 0.02);
}

.step-num {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  border-radius: 8px;
  font-size: 13px;
  font-weight: 600;
  color: var(--vp-c-brand-1);
  background: var(--vp-c-brand-soft);
}

.step-title {
  margin-top: 16px;
  font-size: 16px;
  font-weight: 600;
  color: var(--vp-c-text-1);
}

.step-desc {
  margin-top: 8px;
  font-size: 14px;
  line-height: 1.5;
  color: var(--vp-c-text-2);
}

@media (max-width: 768px) {
  .how-grid {
    grid-template-columns: repeat(2, 1fr);
  }
}

@media (max-width: 480px) {
  .how-grid {
    grid-template-columns: 1fr;
  }

  .how-it-works {
    padding: 48px 20px;
  }
}
</style>
