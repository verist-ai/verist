<template>
  <div class="terminal-demo">
    <div class="terminal">
      <div class="terminal-header">
        <div class="terminal-dots">
          <span style="background: #ff5f57" />
          <span style="background: #febc2e" />
          <span style="background: #28c840" />
        </div>
        <span class="terminal-title">terminal</span>
      </div>
      <pre class="terminal-body"><span class="t-prompt">$</span> <span class="t-cmd">verist test</span>

<span class="t-step">classify-ticket</span><span class="t-dim"> · 10 baselines</span>

  <span class="t-add">✓ 8 unchanged</span>  <span class="t-change">~ 2 changed</span>

  ticket-002
    <span class="t-dim">category:</span> <span class="t-change">&quot;urgent&quot; → &quot;normal&quot;</span>
    <span class="t-dim">confidence:</span> <span class="t-change">0.92 → 0.71</span>
  ticket-009
    <span class="t-dim">category:</span> <span class="t-change">&quot;urgent&quot; → &quot;normal&quot;</span>
    <span class="t-dim">confidence:</span> <span class="t-change">0.88 → 0.65</span>

  <span class="t-change">⚠ 2 regressions — review before shipping</span></pre>
    </div>
  </div>
</template>

<style scoped>
.terminal-demo {
  display: flex;
  justify-content: center;
  padding: 24px 20px;
}

.terminal {
  width: 100%;
  max-width: 600px;
  border-radius: 12px;
  overflow: hidden;
  background: var(--vp-c-bg-alt);
  box-shadow: 0 20px 50px -12px rgba(0, 0, 0, 0.5);
  border: 1px solid var(--vp-c-divider);
}

/* Desktop: wider terminal, no padding, align to the right */
@media (min-width: 960px) {
  .terminal-demo {
    padding: 0;
    justify-content: flex-start;
  }

  .terminal {
    max-width: none;
    width: 680px;
  }
}

.terminal-header {
  display: flex;
  align-items: center;
  padding: 12px 16px;
  border-bottom: 1px solid var(--vp-c-divider);
}

.terminal-dots {
  display: flex;
  gap: 6px;
}

.terminal-dots span {
  width: 10px;
  height: 10px;
  border-radius: 50%;
}

.terminal-title {
  flex: 1;
  text-align: center;
  font-size: 12px;
  color: var(--vp-c-text-3);
  margin-right: 38px; /* offset for dots */
}

.terminal-body {
  padding: 20px;
  margin: 0;
  font-family: var(--vp-font-family-mono);
  font-size: 13px;
  line-height: 1.7;
  overflow-x: auto;
}

.t-prompt {
  color: var(--vp-c-text-3);
}
.t-cmd {
  color: var(--vp-c-text-1);
  font-weight: 500;
}
.t-step {
  color: var(--vp-c-brand-2);
  font-weight: 500;
}
.t-dim {
  color: var(--vp-c-text-3);
}
.t-del {
  color: #f87171;
}
.t-add {
  color: #34d399;
}
.t-change {
  color: #fbbf24;
}
</style>
