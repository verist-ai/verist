<script setup lang="ts">
import { onMounted, onUnmounted, ref } from "vue";

const canvasRef = ref<HTMLCanvasElement | null>(null);
let ctx: CanvasRenderingContext2D | null = null;
let animationFrameId: number;
let particles: Particle[] = [];
let mouse = { x: 0, y: 0 };
let canvasSize = { w: 0, h: 0 };

const particleQuantity = 44;
const particleColor = "255, 255, 255";
const mouseRadius = 200;

class Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  size: number;
  magnetism: number;

  constructor(w: number, h: number) {
    this.x = Math.random() * w;
    this.y = Math.random() * h;
    this.vx = (Math.random() - 0.5) * 0.2;
    this.vy = (Math.random() - 0.5) * 0.2;
    this.size = Math.random() * 2 + 0.1;
    this.magnetism = 2 + Math.random() * 4;
  }

  draw() {
    if (!ctx) return;
    ctx.beginPath();
    ctx.arc(this.x, this.y, this.size, 0, Math.PI * 2);
    ctx.fillStyle = `rgba(${particleColor}, ${this.size / 3})`;
    ctx.fill();
    ctx.closePath();
  }

  update() {
    this.x += this.vx;
    this.y += this.vy;

    if (this.x < 0) this.x = canvasSize.w;
    if (this.x > canvasSize.w) this.x = 0;
    if (this.y < 0) this.y = canvasSize.h;
    if (this.y > canvasSize.h) this.y = 0;

    // Magnetism
    const dx = mouse.x - this.x;
    const dy = mouse.y - this.y;
    const distance = Math.sqrt(dx * dx + dy * dy);

    if (distance < mouseRadius) {
      const forceDirectionX = dx / distance;
      const forceDirectionY = dy / distance;
      const force = (mouseRadius - distance) / mouseRadius;
      const directionX = forceDirectionX * force * this.magnetism;
      const directionY = forceDirectionY * force * this.magnetism;

      this.x -= directionX;
      this.y -= directionY;
    }
  }
}

const resize = () => {
  if (!canvasRef.value) return;
  const parent = canvasRef.value.parentElement;
  if (parent) {
    canvasSize.w = parent.clientWidth;
    canvasSize.h = parent.clientHeight;
    canvasRef.value.width = canvasSize.w;
    canvasRef.value.height = canvasSize.h;
  }
};

const init = () => {
  if (!canvasRef.value) return;
  ctx = canvasRef.value.getContext("2d");
  if (!ctx) return;

  resize();
  particles = [];
  for (let i = 0; i < particleQuantity; i++) {
    particles.push(new Particle(canvasSize.w, canvasSize.h));
  }

  animate();

  window.addEventListener("resize", resize);
  window.addEventListener("mousemove", onMouseMove);
};

const onMouseMove = (e: MouseEvent) => {
  if (canvasRef.value) {
    const rect = canvasRef.value.getBoundingClientRect();
    mouse.x = e.clientX - rect.left;
    mouse.y = e.clientY - rect.top;
  }
};

const animate = () => {
  if (!ctx || !canvasRef.value) return;
  ctx.clearRect(0, 0, canvasSize.w, canvasSize.h);

  particles.forEach((p) => {
    p.update();
    p.draw();
  });

  animationFrameId = requestAnimationFrame(animate);
};

onMounted(() => {
  init();
});

onUnmounted(() => {
  window.removeEventListener("resize", resize);
  window.removeEventListener("mousemove", onMouseMove);
  cancelAnimationFrame(animationFrameId);
});
</script>

<template>
  <div class="stellar-background" aria-hidden="true">
    <canvas ref="canvasRef"></canvas>
  </div>
</template>

<style scoped>
.stellar-background {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%; /* Or specifically hero height */
  z-index: -10; /* Lower z-index to be behind content */
  pointer-events: none;
  overflow: hidden;
}
</style>
