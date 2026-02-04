<script setup></script>

<template>
  <div class="git-analogy">
    <h2>Think of it as Git for AI decisions</h2>
    <div class="comparison-grid">
      <div class="column git">
        <div class="icon git-icon">
          <!-- Simple Git Icon SVG -->
          <svg
            viewBox="0 0 24 24"
            width="24"
            height="24"
            stroke="currentColor"
            stroke-width="2"
            fill="none"
            stroke-linecap="round"
            stroke-linejoin="round"
          >
            <circle cx="12" cy="12" r="3"></circle>
            <line x1="12" y1="9" x2="12" y2="3"></line>
            <line x1="12" y1="15" x2="12" y2="21"></line>
            <line x1="3" y1="12" x2="9" y2="12"></line>
            <line x1="15" y1="12" x2="21" y2="12"></line>
          </svg>
        </div>
        <h3>Git Workflow</h3>
        <div class="item">Code Pull Request</div>
        <div class="arrow">↓</div>
        <div class="item">CI Run</div>
        <div class="arrow">↓</div>
        <div class="item">Line Diff</div>
        <div class="arrow">↓</div>
        <div class="item action">Merge</div>
      </div>

      <div class="divider">
        <div class="line"></div>
      </div>

      <div class="column verist">
        <div class="icon verist-icon">
          <!-- Verist V Icon approximation -->
          <svg
            viewBox="0 0 24 24"
            width="24"
            height="24"
            stroke="currentColor"
            stroke-width="2"
            fill="none"
            stroke-linecap="round"
            stroke-linejoin="round"
          >
            <path d="M12 2L2 22h20L12 2z"></path>
          </svg>
        </div>
        <h3>Verist Workflow</h3>
        <div class="item highlight">Prompt Update</div>
        <div class="arrow">↓</div>
        <div class="item highlight">Recompute</div>
        <div class="arrow">↓</div>
        <div class="item highlight">Decision Diff</div>
        <div class="arrow">↓</div>
        <div class="item action highlight">Approve</div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.git-analogy {
  padding: 80px 24px;
  text-align: center;
}

h2 {
  font-size: 32px;
  font-weight: 800;
  margin-bottom: 60px;
  background: linear-gradient(to right, #fff, #a5b4fc);
  -webkit-background-clip: text;
  background-clip: text;
  -webkit-text-fill-color: transparent;
}

.comparison-grid {
  display: flex;
  justify-content: center;
  align-items: stretch;
  gap: 40px;
  max-width: 600px;
  margin: 0 auto;
}

.column {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 16px;
}

.icon {
  width: 48px;
  height: 48px;
  border-radius: 12px;
  display: flex;
  align-items: center;
  justify-content: center;
  margin-bottom: 12px;
  background: rgba(255, 255, 255, 0.05);
}

.git-icon {
  color: #f34f29;
}
.verist-icon {
  color: #6366f1;
}

h3 {
  font-size: 18px;
  font-weight: 600;
  color: var(--vp-c-text-2);
  margin-bottom: 20px;
}

.item {
  padding: 12px 24px;
  background: rgba(255, 255, 255, 0.03);
  border: 1px solid rgba(255, 255, 255, 0.05);
  border-radius: 8px;
  width: 100%;
  font-size: 15px;
  color: var(--vp-c-text-2);
}

.item.highlight {
  background: rgba(99, 102, 241, 0.1);
  border-color: rgba(99, 102, 241, 0.2);
  color: #a5b4fc;
}

.item.action {
  font-weight: 600;
  background: transparent;
  border-color: transparent;
}

.item.action.highlight {
  color: #fff;
  text-shadow: 0 0 20px rgba(99, 102, 241, 0.5);
}

.arrow {
  color: rgba(255, 255, 255, 0.1);
  font-size: 18px;
}

.divider {
  display: flex;
  align-items: center;
}

.divider .line {
  width: 1px;
  height: 100%;
  background: linear-gradient(
    to bottom,
    transparent,
    rgba(255, 255, 255, 0.1),
    transparent
  );
}
</style>
