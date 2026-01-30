---
# https://vitepress.dev/reference/default-theme-home-page
layout: home
title: "Verist — Replay + diff for AI decisions"
description: "Deterministic, audit-first workflow kernel for production AI systems."

hero:
  name: "Verist"
  text: "Replay + diff for AI decisions"
  tagline: "Upgrade models and prompts without guessing what will break."
  actions:
    - theme: brand
      text: First Step
      link: /guides/first-step
    - theme: alt
      text: Why Verist
      link: /why-verist
    - theme: alt
      text: Full Guide
      link: /getting-started

features:
  - title: Replay any decision
    details: Re-run past AI decisions from stored artifacts. Answer "why did this happen?" months later.
  - title: See what changes before shipping
    details: Recompute with new models or prompts and review exact diffs. No more silent regressions.
  - title: Human overrides that survive
    details: Manual corrections are preserved through recomputation. The system remembers your authority.
---

<div class="trigger-section">
  <h2>Built for when AI decisions need to be...</h2>
  <div class="trigger-list">
    <div class="trigger-item">Reproduced months later for an audit or investigation</div>
    <div class="trigger-item">Reviewed by humans before going live</div>
    <div class="trigger-item">Safely recomputed after model or prompt changes</div>
  </div>
</div>

<div class="mental-model">
  <h3>Mental model</h3>
  <div class="flow-diagram">
    <span class="flow-step">change prompt</span>
    <span class="flow-arrow">→</span>
    <span class="flow-step">recompute</span>
    <span class="flow-arrow">→</span>
    <span class="flow-step">see diff</span>
    <span class="flow-arrow">→</span>
    <span class="flow-step">approve</span>
    <span class="flow-arrow">→</span>
    <span class="flow-step">ship</span>
  </div>
</div>

<div class="comparison-table">
  <h3>How it differs</h3>
  <table>
    <tr>
      <th></th>
      <th>Without Verist</th>
      <th>With Verist</th>
    </tr>
    <tr>
      <td>Debugging</td>
      <td>Logs and guesses</td>
      <td>Exact replay</td>
    </tr>
    <tr>
      <td>Model upgrades</td>
      <td>Re-run and hope</td>
      <td>Recompute + diff</td>
    </tr>
    <tr>
      <td>Human edits</td>
      <td>Lost on recompute</td>
      <td>Preserved by design</td>
    </tr>
  </table>
</div>
