<script setup lang="ts">
const without = [
  "Logs tell you what happened — not what would change",
  "A few test cases can't catch regressions at scale",
  "Recomputation silently overwrites human corrections",
  "Decisions can't be reproduced months later",
];

const withVerist = [
  "Field-level diffs show impact before you ship",
  "Batch recompute across your full history",
  "Human corrections preserved by design",
  "Exact replay from stored artifacts, any time",
];

const analogy = [
  { git: "Code change", verist: "Prompt / model update" },
  { git: "Test run", verist: "Recompute against history" },
  { git: "PR diff", verist: "Decision diff" },
  { git: "Merge", verist: "Approve and persist" },
];
</script>

<template>
  <section class="comparison">
    <div class="comparison-inner">
      <div class="comparison-grid">
        <div class="card card-without">
          <h3 class="card-heading">Without Verist</h3>
          <ul>
            <li v-for="item in without" :key="item">{{ item }}</li>
          </ul>
        </div>
        <div class="card card-with">
          <h3 class="card-heading">With Verist</h3>
          <ul>
            <li v-for="item in withVerist" :key="item">{{ item }}</li>
          </ul>
        </div>
      </div>

      <div class="analogy">
        <div class="analogy-card">
          <p class="analogy-label">Git for AI decisions</p>
          <div class="analogy-rows">
            <template v-for="row in analogy" :key="row.git">
              <span class="chip chip-git">{{ row.git }}</span>
              <span class="pair-arrow">→</span>
              <span class="chip chip-verist">{{ row.verist }}</span>
            </template>
          </div>
        </div>
      </div>
    </div>
  </section>
</template>

<style scoped>
.comparison {
  padding: 64px 24px;
}

.comparison-inner {
  max-width: 1152px;
  margin: 0 auto;
}

.comparison-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 24px;
}

.card {
  padding: 28px;
  border-radius: 16px;
  border: 1px solid var(--vp-c-divider);
  background: rgba(255, 255, 255, 0.02);
}

.card-without {
  border-top: 2px solid #f87171;
}

.card-with {
  border-top: 2px solid #34d399;
}

.card-heading {
  font-size: 16px;
  font-weight: 600;
  color: var(--vp-c-text-1);
  margin-bottom: 20px;
}

.card ul {
  list-style: none;
  padding: 0;
  margin: 0;
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.card li {
  font-size: 14px;
  line-height: 1.5;
  color: var(--vp-c-text-2);
  padding-left: 24px;
  position: relative;
}

.card-without li::before {
  content: "×";
  position: absolute;
  left: 0;
  color: #f87171;
  font-weight: 700;
  font-size: 15px;
}

.card-with li::before {
  content: "✓";
  position: absolute;
  left: 0;
  color: #34d399;
  font-weight: 700;
}

/* Analogy */
.analogy {
  margin-top: 48px;
  display: flex;
  justify-content: center;
}

.analogy-card {
  padding: 32px 40px;
  border-radius: 16px;
  border: 1px solid var(--vp-c-divider);
  background: rgba(255, 255, 255, 0.02);
  text-align: center;
}

.analogy-label {
  font-family: var(--vp-font-family-mono);
  font-size: 13px;
  color: var(--vp-c-text-3);
  letter-spacing: 0.02em;
  margin-bottom: 24px;
}

.analogy-rows {
  display: inline-grid;
  grid-template-columns: auto auto auto;
  gap: 10px 16px;
  align-items: center;
}

.chip {
  padding: 6px 14px;
  border-radius: 6px;
  font-size: 13px;
  font-weight: 500;
  white-space: nowrap;
}

.chip-git {
  justify-self: end;
  background: rgba(255, 255, 255, 0.06);
  color: var(--vp-c-text-2);
}

.chip-verist {
  background: var(--vp-c-brand-soft);
  color: var(--vp-c-brand-2);
}

.pair-arrow {
  color: var(--vp-c-text-3);
  font-size: 13px;
}

@media (max-width: 768px) {
  .comparison-grid {
    grid-template-columns: 1fr;
  }
}

@media (max-width: 480px) {
  .comparison {
    padding: 48px 20px;
  }

  .analogy-card {
    padding: 24px 20px;
  }

  .chip {
    padding: 5px 10px;
    font-size: 12px;
  }

  .analogy-rows {
    gap: 8px 10px;
  }
}
</style>
