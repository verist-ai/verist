<script setup></script>

<template>
  <div class="use-case-spotlight">
    <div class="content">
      <div class="label">Canonical Use Case</div>
      <h2>Support Ticket Triage</h2>
      <p class="description">
        Classify priority, extract entities, suggest response.
        <span class="highlight">Human overrides must survive re-runs.</span>
      </p>

      <div class="flow-visual">
        <div class="step">
          <div class="step-icon">📩</div>
          <div class="step-label">Ticket In</div>
        </div>
        <div class="connector">→</div>
        <div class="step">
          <div class="step-icon">🤖</div>
          <div class="step-label">AI Classify</div>
          <div class="step-sub">"Priority: Low"</div>
        </div>
        <div class="connector">→</div>
        <div class="step warning">
          <div class="step-icon">⚠️</div>
          <div class="step-label">Low Confidence</div>
        </div>
        <div class="connector">→</div>
        <div class="step human">
          <div class="step-icon">👤</div>
          <div class="step-label">Human Override</div>
          <div class="step-sub">"Set High"</div>
        </div>
      </div>

      <div class="value-prop">
        <div class="check">✓</div>
        <div>
          When model upgrades, the human decision is <strong>preserved</strong>,
          not overwritten.
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.use-case-spotlight {
  padding: 80px 24px;
  background: linear-gradient(
    180deg,
    rgba(255, 255, 255, 0.02) 0%,
    transparent 100%
  );
  border-top: 1px solid rgba(255, 255, 255, 0.05);
  border-bottom: 1px solid rgba(255, 255, 255, 0.05);
}

.content {
  max-width: 800px;
  margin: 0 auto;
  text-align: center;
}

.label {
  text-transform: uppercase;
  font-size: 12px;
  letter-spacing: 0.1em;
  color: var(--vp-c-brand-2);
  margin-bottom: 12px;
  font-weight: 600;
}

h2 {
  font-size: 32px;
  font-weight: 800;
  margin-bottom: 16px;
  color: #fff;
}

.description {
  font-size: 18px;
  color: var(--vp-c-text-2);
  margin-bottom: 48px;
  line-height: 1.6;
}

.highlight {
  color: #fff;
  border-bottom: 1px dashed var(--vp-c-brand-2);
}

.flow-visual {
  display: flex;
  justify-content: center;
  align-items: center;
  gap: 16px;
  margin-bottom: 48px;
  flex-wrap: wrap;
}

.step {
  background: rgba(0, 0, 0, 0.3);
  border: 1px solid rgba(255, 255, 255, 0.1);
  padding: 16px;
  border-radius: 12px;
  min-width: 120px;
}

.step.warning {
  border-color: rgba(250, 204, 21, 0.3);
  background: rgba(250, 204, 21, 0.05);
}

.step.human {
  border-color: rgba(99, 102, 241, 0.5);
  background: rgba(99, 102, 241, 0.1);
  box-shadow: 0 0 20px rgba(99, 102, 241, 0.2);
}

.step-icon {
  font-size: 24px;
  margin-bottom: 8px;
}

.step-label {
  font-size: 14px;
  font-weight: 600;
  color: var(--vp-c-text-1);
}

.step-sub {
  font-size: 12px;
  color: var(--vp-c-text-2);
  margin-top: 4px;
}

.connector {
  font-size: 20px;
  color: rgba(255, 255, 255, 0.2);
}

.value-prop {
  display: inline-flex;
  align-items: center;
  gap: 12px;
  background: rgba(99, 102, 241, 0.1);
  border: 1px solid rgba(99, 102, 241, 0.2);
  padding: 12px 24px;
  border-radius: 9999px;
  font-size: 15px;
  color: #e0e7ff;
}

.check {
  color: #4ade80;
  font-weight: 800;
}
</style>
