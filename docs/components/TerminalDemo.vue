<script setup></script>

<template>
  <div class="terminal-demo">
    <div class="terminal-window">
      <div class="terminal-header">
        <div class="dot red"></div>
        <div class="dot yellow"></div>
        <div class="dot green"></div>
        <div class="title">verist-cli — -zsh</div>
      </div>
      <div class="terminal-body">
        <div class="line command">
          <span class="prompt">$</span> verist test --workflow claim-extraction
          --sample 100
        </div>
        <div class="line output">
          Running 100 tests against "claim-extraction-v2"...
        </div>
        <div class="line output success">✓ 94 unchanged</div>
        <div class="line output improved">~ 4 improved (higher confidence)</div>
        <div class="line output failure">✗ 2 regressions (verdict changed)</div>
        <div class="line output error-detail">
          > Run #42: "Revenue: $5M" → "Revenue: null"
          <a href="#" class="diff-link">[View diff]</a>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.terminal-demo {
  padding: 40px 20px;
  display: flex;
  justify-content: center;
}

.terminal-window {
  width: 100%;
  max-width: 800px;
  background: #1e1e1e;
  border-radius: 12px;
  box-shadow: 0 20px 60px rgba(0, 0, 0, 0.5);
  overflow: hidden;
  font-family: "JetBrains Mono", monospace; /* Fallback to monospace */
  border: 1px solid rgba(255, 255, 255, 0.1);
}

.terminal-header {
  background: #2d2d2d;
  padding: 12px 16px;
  display: flex;
  align-items: center;
  gap: 8px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.05);
}

.dot {
  width: 12px;
  height: 12px;
  border-radius: 50%;
}
.red {
  background: #ff5f57;
}
.yellow {
  background: #febc2e;
}
.green {
  background: #28c840;
}

.title {
  margin-left: 12px;
  color: #999;
  font-size: 13px;
  font-family:
    -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
}

.terminal-body {
  padding: 24px;
  font-size: 15px;
  line-height: 1.6;
}

.line {
  margin-bottom: 4px;
  color: #d4d4d4;
}

.command {
  color: #fff;
  font-weight: 500;
}

.prompt {
  color: #6366f1; /* Brand color */
  margin-right: 8px;
}

.success {
  color: #4ade80;
}
.improved {
  color: #facc15;
}
.failure {
  color: #ef4444;
}
.error-detail {
  padding-left: 20px;
  color: #a3a3a3;
  font-style: italic;
}

.diff-link {
  color: #6366f1;
  text-decoration: underline;
  cursor: pointer;
}
</style>
