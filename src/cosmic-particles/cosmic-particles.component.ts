import {
  Component,
  ElementRef,
  ViewChild,
  AfterViewInit,
  OnDestroy,
  HostListener,
  ChangeDetectorRef,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { Analytics, logEvent } from '@angular/fire/analytics';

const GAME_CONFIG = {
  baseParticleCount: 700,
  maxParticles: 1200, // A hard cap to prevent performance degradation
  minTimeBetweenKeysMs: 100,
  comboTimeWindowMs: 400, // Time window to press 4 keys for a combo
  keyFatigue: {
    initialCooldownMs: 200, // Base cooldown for a key
    cooldownIncrementMs: 150, // Penalty for spamming
    maxCooldownMs: 2000, // Max penalty
    comboCooldownMs: 3000, // Cooldown for a successful 4-key combo
    cooldownDecayIntervalMs: 100, // How often to reduce cooldowns
    cooldownDecayRateMs: 25, // How much to reduce by
  },
  mobile: {
    gridSize: 10, // Creates a 10x10 grid for tap fatigue detection
  },
  console: {
    maxLines: 50,
  },
  timer: {
    initialSeconds: 10,
    bonusSecondsPerLevel: 10,
    comboBonusBase: 2,
    comboBonusDecay: 0.1,
    comboBonusMin: 1,
    comboBonusProbability: 0.15, // 15% chance for a time bonus on a high strike
  },
  difficulty: {
    levelTargetBase: 100,
    levelTargetMultiplier: 10,
    // An exponent > 1 creates a steeper difficulty curve for higher levels.
    levelTargetExponent: 4,
  },
  progressBarGradients: [
    'linear-gradient(90deg, #00ffff 0%, #00ff00 50%, #ffd700 100%)',
    'linear-gradient(90deg, #ff00ff 0%, #ff6ec7 50%, #7b68ee 100%)',
    'linear-gradient(90deg, #ff6600 0%, #ffff00 50%, #ff0000 100%)',
  ],
  sounds: {
    comboSounds: ['bum.mp3', 'crush.mp3', 'smash.mp3', 'bam.mp3', 'booom.mp3'],
  },
  levelNotificationDurationMs: 1200,
  cosmicParticle: {
    colors: ['#4a9eff', '#7b68ee', '#00ffff', '#ff6ec7', '#ffd700', '#ffffff'],
  },
  explosion: {
    colors: [
      '#ff0000',
      '#ff6600',
      '#ffff00',
      '#00ff00',
      '#00ffff',
      '#ff00ff',
      '#ffffff',
    ],
    types: {
      small: {
        particleCount: { min: 10, max: 25 },
        particleSize: { min: 2, max: 4 },
        particleSpeed: { min: 4, max: 8 },
        score: 1,
        probability: 0.75, // 75% chance
      },
      medium: {
        particleCount: { min: 40, max: 60 },
        particleSize: { min: 2, max: 5 },
        particleSpeed: { min: 6, max: 12 },
        score: 5,
        probability: 0.2, // 20% chance
      },
      large: {
        particleCount: { min: 70, max: 100 },
        particleSize: { min: 3, max: 7 },
        particleSpeed: { min: 8, max: 16 },
        score: 25,
        probability: 0.05, // 5% chance
      },
      highStrike: {
        particleCount: { min: 150, max: 200 },
        particleSize: { min: 4, max: 9 },
        particleSpeed: { min: 10, max: 20 },
        score: 100, // This will fill the progress bar instantly
        probability: 0, // Not triggered by random chance
      },
    },
  },
};

const PERSPECTIVE = 500;
const FOCAL_LENGTH = 500;

interface Particle {
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  baseSize: number;
  color: string;
  alpha: number;
  life: number;
  shape?: 'circle' | 'square' | 'triangle';
  originalVx?: number;
  originalVy?: number;
}

interface FogSpot {
  shape: 'circle' | 'triangle' | 'rectangle';
  x: number;
  y: number;
  size: number;
  rotation: number;
  color: string;
  alpha: number;
  life: number;
}

type ExplosionType = {
  particleCount: { min: number; max: number };
  particleSize: { min: number; max: number };
  particleSpeed: { min: number; max: number };
  score: number;
  probability: number;
};

interface KeyPosition {
  x: number;
  y: number;
}

@Component({
  selector: 'app-cosmic-particles',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './cosmic-particles.component.html',
  styleUrls: ['./cosmic-particles.component.scss'],
})
export class CosmicParticlesComponent implements AfterViewInit, OnDestroy {
  @ViewChild('canvas', { static: true })
  canvasRef!: ElementRef<HTMLCanvasElement>;

  @ViewChild('console') consoleEl!: ElementRef<HTMLDivElement>;

  private ctx!: CanvasRenderingContext2D;
  private particles: Particle[] = [];
  private fogSpots: FogSpot[] = [];
  private animationId = 0;
  private lastKeyPressTime = 0;
  private keyCooldowns: Map<string, number> = new Map();
  private lastPressTimes: Map<string, number> = new Map();
  private activeKeys: Set<string> = new Set();
  private gameTimerInterval: number | undefined;
  private cooldownDecayInterval: number | undefined;
  private keyboardMatrix: Map<string, KeyPosition> = new Map();
  private comboKeyTimestamps: number[] = [];
  private mobileTapTimestamps: number[] = [];
  private lastTouchCount = 0;
  comboText: { text: string; style: { [key: string]: string } } | null = null;
  comboPulseActive = false;
  countdownValue: string | null = null;
  currentProgressBarGradient = GAME_CONFIG.progressBarGradients[0];

  score: number = 0;
  level: number = 1;
  progress: number = 0;
  progressTarget: number = 100;
  timer: number = 0;
  isGameOver: boolean = false;
  consoleLogs: string[] = [];
  isGameStarted: boolean = false;
  showLevelUp: boolean = false;

  constructor(private cdr: ChangeDetectorRef, private analytics: Analytics) {}

  restartGame(): void {
    // Stop any running animations and intervals
    this.stopAllIntervals();
    if (this.animationId) {
      cancelAnimationFrame(this.animationId);
    }

    // Reset game state
    this.score = 0;
    this.level = 1;
    this.progress = 0;
    this.isGameOver = false;
    this.consoleLogs = [];
    this.particles = [];
    this.fogSpots = [];
    this.keyCooldowns.clear();
    this.lastPressTimes.clear();
    this.activeKeys.clear();
    this.comboKeyTimestamps = [];
    this.mobileTapTimestamps = [];
    this.comboText = null;
    this.comboPulseActive = false;
    this.currentProgressBarGradient = GAME_CONFIG.progressBarGradients[0];

    this.lastTouchCount = 0;
    // Re-initialize particles and restart the animation loop
    this.initializeParticles();
    this.animate();

    // Directly start the countdown for the new game
    this.startGame();
  }

  startGame(): void {
    this.countdownValue = '3';
    this.cdr.markForCheck();

    setTimeout(() => {
      this.countdownValue = '2';
      this.cdr.markForCheck();
    }, 1000);

    setTimeout(() => {
      this.countdownValue = '1';
      this.cdr.markForCheck();
    }, 2000);

    setTimeout(() => {
      this.countdownValue = 'GO!';
      this.cdr.markForCheck();
    }, 3000);

    setTimeout(() => {
      this.countdownValue = null;
      this.isGameStarted = true;
      this.logToConsole('Game Started!');
      this.startGameTimer();
      this.updateProgressTarget();
      this.startCooldownDecay();
    }, 4000);
  }

  getProgressBarGradient(): string {
    return this.currentProgressBarGradient;
  }

  ngAfterViewInit() {
    const canvas = this.canvasRef.nativeElement;
    this.ctx = canvas.getContext('2d')!;

    this.resizeCanvas();
    this.initializeParticles();
    this.animate();
    this.addPunctuationStyles();
    this.initializeKeyboardMatrix();
  }

  ngOnDestroy() {
    this.stopAllIntervals();
  }

  private stopAllIntervals() {
    if (this.cooldownDecayInterval) {
      clearInterval(this.cooldownDecayInterval);
    }
    if (this.gameTimerInterval) {
      clearInterval(this.gameTimerInterval);
    }
  }

  @HostListener('window:resize')
  onResize() {
    this.resizeCanvas();
    this.initializeKeyboardMatrix();
  }

  @HostListener('mousedown', ['$event'])
  onMouseDown(event: MouseEvent) {
    if (this.isGameOver || !this.isGameStarted) return;
    this.handleInteraction(event.clientX, event.clientY);
  }

  @HostListener('touchstart', ['$event'])
  onTouchStart(event: TouchEvent) {
    if (this.isGameOver || !this.isGameStarted) return;
    event.preventDefault(); // Prevents firing mouse events as well

    const currentTouchCount = event.touches.length;

    // Trigger a combo only on the frame where the touch count increases to 3 or more
    if (currentTouchCount >= 3 && this.lastTouchCount < currentTouchCount) {
      // Multi-finger tap detected, process as a mobile combo
      this.processMobileCombo();
    } else if (currentTouchCount > this.lastTouchCount) {
      // This is a new single touch, handle it normally
      // We use the last touch in the list as it's the newest one
      const newTouch = event.touches[currentTouchCount - 1];
      this.handleInteraction(newTouch.clientX, newTouch.clientY);
    }

    this.lastTouchCount = currentTouchCount;
  }

  @HostListener('touchend', ['$event'])
  onTouchEnd(event: TouchEvent) {
    this.lastTouchCount = event.touches.length;
  }

  @HostListener('window:keydown', ['$event'])
  onKeyDown(event: KeyboardEvent) {
    if (this.isGameOver || !this.isGameStarted) return;

    if (
      event.key === 'Meta' ||
      event.key === 'Shift' ||
      event.key === 'Alt' ||
      event.key === 'Control' ||
      event.key === 'Tab' ||
      event.key === 'CapsLock' ||
      event.ctrlKey ||
      event.metaKey ||
      event.shiftKey ||
      event.altKey
    ) {
      // If a modifier key is pressed, prevent any browser shortcuts
      // and stop the event from propagating further.
      event.preventDefault();
      event.stopPropagation();
      return;
    }

    const key = event.key.toLowerCase();
    const isAlphabetical = /^[a-z]$/.test(key);

    if (!isAlphabetical) {
      event.preventDefault();
      return;
    }

    event.preventDefault();

    // Ignore if key is already held down or if we already have 4 keys
    if (this.activeKeys.has(key) || this.activeKeys.size >= 4) {
      return;
    }

    this.activeKeys.add(key);
    this.comboKeyTimestamps.push(Date.now());

    // Check for 4-key combo
    if (this.activeKeys.size === 4) {
      this.processCombo();
    }
  }

  private processCombo(comboIdentifier?: string) {
    const currentTime = Date.now();

    if (!comboIdentifier) {
      // This is a keyboard combo, perform keyboard-specific checks
      const firstPressTime = this.comboKeyTimestamps[0];
      if (currentTime - firstPressTime > GAME_CONFIG.comboTimeWindowMs) {
        this.logToConsole(`Combo attempt too slow.`);
        return; // Combo failed, keys will be processed individually on keyup
      }
      comboIdentifier = Array.from(this.activeKeys).sort().join('-');

      // Calculate the center point of the combo keys
      let totalX = 0;
      let totalY = 0;
      let keyCount = 0;
      for (const key of this.activeKeys) {
        const pos = this.keyboardMatrix.get(key);
        if (pos) {
          totalX += pos.x;
          totalY += pos.y;
          keyCount++;
        }
      }

      const comboX =
        keyCount > 0
          ? totalX / keyCount
          : this.canvasRef.nativeElement.width / 2;
      const comboY =
        keyCount > 0
          ? totalY / keyCount
          : this.canvasRef.nativeElement.height / 2;

      this.triggerEffect(
        comboX,
        comboY,
        GAME_CONFIG.explosion.types.highStrike
      );
      this.triggerComboText(comboX, comboY);
    } else {
      // For mobile combos, keep it in the center for a big impact
      const { width, height } = this.canvasRef.nativeElement;
      this.triggerEffect(
        width / 2,
        height / 2,
        GAME_CONFIG.explosion.types.highStrike
      );
      this.triggerComboText(width / 2, height / 2);
    }

    const { keyFatigue } = GAME_CONFIG;
    const lastPress = this.lastPressTimes.get(comboIdentifier) || 0;

    if (currentTime - lastPress < keyFatigue.comboCooldownMs) {
      this.logToConsole(`Combo '${comboIdentifier}' on cooldown.`);
      return;
    }

    this.logToConsole(`High Strike! Combo: '${comboIdentifier}'`);
    logEvent(this.analytics, 'high_strike_combo', {
      combo_keys: comboIdentifier,
      level: this.level,
    });
    this.playRandomComboSound();

    const { timer: timerConfig } = GAME_CONFIG;
    if (Math.random() < timerConfig.comboBonusProbability) {
      const timeBonus = Math.max(
        timerConfig.comboBonusMin,
        timerConfig.comboBonusBase -
          (this.level - 1) * timerConfig.comboBonusDecay
      );
      this.timer += timeBonus;
      this.logToConsole(`Lucky! +${timeBonus.toFixed(2)}s time bonus!`);
    }

    this.comboPulseActive = true;
    setTimeout(() => {
      this.comboPulseActive = false;
    }, 200);
    this.progress += GAME_CONFIG.explosion.types.highStrike.score;
    this.updateProgress();
    this.lastPressTimes.set(comboIdentifier, currentTime);
    this.comboKeyTimestamps = [];
    this.activeKeys.clear(); // Consume the keys
  }

  private processInput(identifier: string, x: number, y: number) {
    if (this.isGameOver || !this.isGameStarted) return;

    const currentTime = Date.now();
    // Global rapid-fire prevention
    if (
      currentTime - this.lastKeyPressTime <
      GAME_CONFIG.minTimeBetweenKeysMs
    ) {
      return;
    }

    // Key-specific fatigue logic
    const { keyFatigue } = GAME_CONFIG;
    const lastPress = this.lastPressTimes.get(identifier) || 0;
    const currentCooldown =
      this.keyCooldowns.get(identifier) || keyFatigue.initialCooldownMs;

    if (currentTime - lastPress < currentCooldown) {
      // Key is on cooldown, penalize by increasing its cooldown
      const newCooldown = Math.min(
        currentCooldown + keyFatigue.cooldownIncrementMs,
        keyFatigue.maxCooldownMs
      );
      this.keyCooldowns.set(identifier, newCooldown);
      this.logToConsole(`Input '${identifier}' on cooldown.`);
      return; // Do not score or create an explosion
    }

    // Valid press, update timers
    this.lastPressTimes.set(identifier, currentTime);
    this.logToConsole(`Input '${identifier}' processed.`);

    this.lastKeyPressTime = currentTime;

    const rand = Math.random();
    const { small, medium, large } = GAME_CONFIG.explosion.types;
    let explosionType: ExplosionType;
    let progressIncrement: number;

    if (rand < small.probability) {
      explosionType = small;
      progressIncrement = small.score;
    } else if (rand < small.probability + medium.probability) {
      explosionType = medium;
      progressIncrement = medium.score;
    } else {
      explosionType = large;
      progressIncrement = large.score;
    }

    this.triggerEffect(x, y, explosionType);
    this.progress += progressIncrement;
    this.updateProgress();
  }

  @HostListener('window:keyup', ['$event'])
  onKeyUp(event: KeyboardEvent) {
    if (this.isGameOver || !this.isGameStarted) return;

    if (
      event.key === 'Meta' ||
      event.key === 'Shift' ||
      event.key === 'Alt' ||
      event.key === 'Control' ||
      event.key === 'Tab' ||
      event.key === 'CapsLock' ||
      event.ctrlKey ||
      event.metaKey ||
      event.shiftKey ||
      event.altKey
    ) {
      event.preventDefault();
      event.stopPropagation();
      return;
    }

    const key = event.key.toLowerCase();

    // If the key was part of the active set, it means it was held.
    // If it wasn't consumed by a combo, process it as a single press.
    if (this.activeKeys.has(key)) {
      // Remove the key and its timestamp from combo tracking
      this.activeKeys.delete(key);
      this.comboKeyTimestamps.shift(); // Assume FIFO for simplicity

      const pos = this.keyboardMatrix.get(key);
      if (pos) {
        this.processInput(key, pos.x, pos.y);
      }
    }
  }

  private processMobileCombo() {
    const currentTime = Date.now();
    const { keyFatigue } = GAME_CONFIG;
    const comboIdentifier = 'mobile-combo';
    const lastPress = this.lastPressTimes.get(comboIdentifier) || 0;

    if (currentTime - lastPress < keyFatigue.comboCooldownMs) {
      this.logToConsole(`Mobile combo on cooldown.`);
      return;
    }

    // All checks passed, execute the combo logic by calling the main processCombo method
    this.logToConsole('Mobile High Strike!');
    this.processCombo(comboIdentifier);
    this.lastPressTimes.set(comboIdentifier, currentTime);
  }

  private playSound(soundFile: string): void {
    const audio = new Audio(`assets/sounds/${soundFile}`);
    audio.play().catch((error) => console.error(`Error playing sound:`, error));
  }

  private playRandomComboSound(): void {
    const { comboSounds } = GAME_CONFIG.sounds;
    if (comboSounds.length > 0) {
      const soundFile =
        comboSounds[Math.floor(Math.random() * comboSounds.length)];
      this.playSound(soundFile);
    }
  }

  private handleInteraction(x: number, y: number) {
    // Find the nearest key in the matrix to the tap location
    let nearestKey: string | null = null;
    let minDistance = Infinity;

    for (const [key, pos] of this.keyboardMatrix.entries()) {
      const distance = Math.sqrt(
        Math.pow(x - pos.x, 2) + Math.pow(y - pos.y, 2)
      );
      if (distance < minDistance) {
        minDistance = distance;
        nearestKey = key;
      }
    }

    if (nearestKey) {
      this.processInput(nearestKey, x, y);
    }
  }

  private resizeCanvas() {
    const canvas = this.canvasRef.nativeElement;
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
    this.initializeKeyboardMatrix();
  }

  private initializeParticles() {
    const canvas = this.canvasRef.nativeElement;

    for (let i = 0; i < GAME_CONFIG.baseParticleCount; i++) {
      this.particles.push(this.createCosmicParticle(canvas));
    }
  }

  private createCosmicParticle(canvas: HTMLCanvasElement): Particle {
    const colors = GAME_CONFIG.cosmicParticle.colors;
    return {
      x: Math.random() * canvas.width,
      y: Math.random() * canvas.height,
      z: Math.random() * PERSPECTIVE,
      vx: (Math.random() - 0.5) * 0.5,
      vy: (Math.random() - 0.5) * 0.5,
      vz: 0,
      baseSize: Math.random() * 2 + 1,
      color: colors[Math.floor(Math.random() * colors.length)],
      alpha: Math.random() * 0.5 + 0.5,
      life: 1,
    };
  }

  private logToConsole(message: string) {
    const timestamp = new Date().toLocaleTimeString();
    this.consoleLogs.push(`[${timestamp}] ${message}`);

    if (this.consoleLogs.length > GAME_CONFIG.console.maxLines) {
      this.consoleLogs.shift(); // Remove the oldest log
    }

    this.scrollToConsoleBottom();
  }

  private scrollToConsoleBottom(): void {
    setTimeout(() => {
      if (this.consoleEl) {
        this.consoleEl.nativeElement.scrollTop =
          this.consoleEl.nativeElement.scrollHeight;
      }
    }, 0);
  }

  private triggerComboText(x: number, y: number) {
    const comboTexts = ['BUM', 'BAM', 'CRUSH', 'BOOOM', 'SMASH'];

    const baseText = comboTexts[Math.floor(Math.random() * comboTexts.length)];
    const fullText = `<span>${baseText}</span><span class="combo-text-punctuation">!!!</span>`;

    const startAngle = Math.random() * 60 - 30;
    const endAngle = startAngle + (Math.random() * 20 - 10);
    const colors = GAME_CONFIG.explosion.colors;
    const color = colors[Math.floor(Math.random() * colors.length)];

    this.comboText = {
      text: fullText,
      style: {
        top: `${y}px`,
        left: `${x}px`,
        color: color,
        '--start-rotate': `${startAngle}deg`,
        '--end-rotate': `${endAngle}deg`,
      },
    };

    // Clear the text after the animation
    setTimeout(() => (this.comboText = null), 1000);
  }

  private addPunctuationStyles() {
    const styleEl = document.createElement('style');
    styleEl.innerHTML = `.combo-text-punctuation { font-family: Impact, sans-serif; }`;
    document.head.appendChild(styleEl);
  }

  private initializeKeyboardMatrix() {
    const canvas = this.canvasRef.nativeElement;
    const allKeys = 'abcdefghijklmnopqrstuvwxyz';

    this.keyboardMatrix.clear();

    for (const key of allKeys) {
      const x = Math.random() * canvas.width;
      const y = Math.random() * canvas.height;
      this.keyboardMatrix.set(key, { x, y });
    }
  }

  private triggerEffect(x: number, y: number, explosionType: ExplosionType) {
    this.createFogSpot(x, y, explosionType);
    this.createParticleExplosion(x, y, explosionType);
    this.scatterCosmicParticles(x, y, explosionType);
  }
  private createFogSpot(x: number, y: number, explosionType: ExplosionType) {
    const shapes = ['circle', 'triangle', 'rectangle'];
    const shape = shapes[Math.floor(Math.random() * shapes.length)] as
      | 'circle'
      | 'triangle'
      | 'rectangle';
    const colors = GAME_CONFIG.explosion.colors;

    const newFogSpot: FogSpot = {
      shape,
      x,
      y,
      size:
        Math.random() * (explosionType.particleSize.max * 20) +
        explosionType.particleSize.min * 20,
      rotation: Math.random() * Math.PI * 2,
      color: colors[Math.floor(Math.random() * colors.length)],
      alpha: 0.7, // Initial opacity
      life: 1, // Will decrease over time
    };
    this.fogSpots.push(newFogSpot);
  }

  private createParticleExplosion(
    x: number,
    y: number,
    explosionType: ExplosionType
  ) {
    let particleCount =
      Math.floor(
        Math.random() *
          (explosionType.particleCount.max -
            explosionType.particleCount.min +
            1)
      ) + explosionType.particleCount.min;

    // Dynamically reduce particle count if the system is under load
    const currentParticleCount = this.particles.length;
    if (currentParticleCount > GAME_CONFIG.baseParticleCount) {
      const loadFactor =
        (currentParticleCount - GAME_CONFIG.baseParticleCount) /
        (GAME_CONFIG.maxParticles - GAME_CONFIG.baseParticleCount);
      particleCount *= 1 - Math.min(loadFactor, 1) * 0.75; // Reduce by up to 75%
    }

    for (let i = 0; i < particleCount; i++) {
      this.particles.push(this.createExplosionParticle(x, y, explosionType));
    }
  }

  private createExplosionParticle(
    x: number,
    y: number,
    config: ExplosionType
  ): Particle {
    const angle = Math.random() * Math.PI * 2;
    const speed =
      (Math.random() * 0.7 + 0.3) *
      (Math.random() * (config.particleSpeed.max - config.particleSpeed.min) +
        config.particleSpeed.min);
    const colors = GAME_CONFIG.explosion.colors;
    const shapes: Particle['shape'][] = ['circle', 'square', 'triangle'];

    return {
      x: x + (Math.random() - 0.5) * 40, // Start in a small area
      y: y + (Math.random() - 0.5) * 40,
      z: 0,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      vz: (Math.random() - 0.5) * speed, // Give it 3D velocity
      baseSize:
        Math.random() * (config.particleSize.max - config.particleSize.min) +
        config.particleSize.min,
      color: colors[Math.floor(Math.random() * colors.length)],
      alpha: 1,
      life: 1, // Explosion particles have a limited life
      shape: shapes[Math.floor(Math.random() * shapes.length)],
    };
  }

  private scatterCosmicParticles(
    x: number,
    y: number,
    explosionType: ExplosionType
  ) {
    const scatterRadius = explosionType.particleSize.max * 40; // How far the effect reaches
    const scatterStrength = explosionType.particleSpeed.max * 0.75; // How strong the push is

    this.particles.forEach((particle) => {
      // Only affect background cosmic particles that aren't already scattered
      if (particle.vz === 0 && particle.originalVx === undefined) {
        const dx = particle.x - x;
        const dy = particle.y - y;
        const distance = Math.sqrt(dx * dx + dy * dy);

        if (distance < scatterRadius) {
          // Store original velocity so we can return to it
          particle.originalVx = particle.vx;
          particle.originalVy = particle.vy;

          const force = (1 - distance / scatterRadius) * scatterStrength;
          const angle = Math.atan2(dy, dx);

          particle.vx += Math.cos(angle) * force;
          particle.vy += Math.sin(angle) * force;
        }
      }
    });
  }

  private startGameTimer() {
    this.timer = GAME_CONFIG.timer.initialSeconds;
    this.gameTimerInterval = window.setInterval(() => {
      this.timer--;
      if (this.timer <= 0) {
        this.timer = 0;
        this.gameOver();
      }
      this.cdr.markForCheck(); // Manually trigger change detection for the timer
    }, 1000);
  }

  private startCooldownDecay() {
    const { keyFatigue } = GAME_CONFIG;
    this.cooldownDecayInterval = window.setInterval(() => {
      for (const [key, cooldown] of this.keyCooldowns.entries()) {
        const newCooldown = Math.max(
          keyFatigue.initialCooldownMs,
          cooldown - keyFatigue.cooldownDecayRateMs
        );
        this.keyCooldowns.set(key, newCooldown);
        if (newCooldown === keyFatigue.initialCooldownMs) {
          this.keyCooldowns.delete(key); // Clean up if back to base
        }
      }
    }, keyFatigue.cooldownDecayIntervalMs);
  }

  private updateProgress() {
    while (this.progress >= this.progressTarget) {
      this.progress -= this.progressTarget;
      this.timer += GAME_CONFIG.timer.bonusSecondsPerLevel;
      this.score += 10 * this.level;
      this.level++;
      this.currentProgressBarGradient =
        GAME_CONFIG.progressBarGradients[
          (this.level - 1) % GAME_CONFIG.progressBarGradients.length
        ];
      this.updateProgressTarget();

      this.showLevelUp = true; // This will re-trigger the animation
      this.cdr.detectChanges(); // Manually trigger change detection for the animation
      setTimeout(() => {
        this.showLevelUp = false;
      }, GAME_CONFIG.levelNotificationDurationMs);
    }
  }

  private gameOver() {
    this.isGameOver = true;
    this.logToConsole(`Game Over! Final Score: ${this.score}`);
    if (this.animationId) {
      cancelAnimationFrame(this.animationId);
    }
    this.stopAllIntervals(); // This now includes the timer
    if (this.gameTimerInterval) clearInterval(this.gameTimerInterval);
  }

  private updateProgressTarget() {
    const { difficulty } = GAME_CONFIG;
    this.progressTarget =
      difficulty.levelTargetBase +
      Math.pow(this.level, difficulty.levelTargetExponent) *
        difficulty.levelTargetMultiplier;
  }

  private updateParticles() {
    this.particles = this.particles.filter((particle) => {
      particle.x += particle.vx;
      particle.y += particle.vy;
      particle.z += particle.vz;

      // Explosion particles (which have a vz) fade and fall
      if (particle.vz !== 0) {
        particle.life -= 0.06;
        particle.alpha = particle.life;
        particle.vy += 0.05; // a little gravity
      } else if (particle.originalVx !== undefined) {
        // Scattered cosmic particles should slow down back to their original speed
        const friction = 0.95; // The closer to 1, the slower the deceleration
        particle.vx *= friction;
        particle.vy *= friction;

        // If it's slow enough, reset it to its original state
        if (
          particle.originalVy !== undefined &&
          Math.abs(particle.vx) < Math.abs(particle.originalVx) + 0.1
        ) {
          particle.vx = particle.originalVx;
          particle.vy = particle.originalVy;
          delete particle.originalVx;
          delete particle.originalVy;
        }
      } else {
        // Cosmic particles wrap around
        const canvas = this.canvasRef.nativeElement;
        if (particle.x < 0) particle.x = canvas.width;
        if (particle.x > canvas.width) particle.x = 0;
        if (particle.y < 0) particle.y = canvas.height;
        if (particle.y > canvas.height) particle.y = 0;

        // Their alpha is based on z-depth for perspective
        if (particle.z > 0) {
          particle.alpha = 0.5 * (1 - particle.z / PERSPECTIVE);
        }
      }

      return particle.life > 0; // Remove dead particles
    });

    while (this.particles.length < GAME_CONFIG.baseParticleCount) {
      const canvas = this.canvasRef.nativeElement;
      this.particles.push(this.createCosmicParticle(canvas));
    }

    // Update fog spots
    this.fogSpots = this.fogSpots.filter((spot) => {
      spot.life -= 0.07; // Fade out speed
      spot.alpha = spot.life * 0.7;
      return spot.life > 0;
    });
  }

  private drawParticles() {
    this.particles.forEach((particle) => {
      const perspective = FOCAL_LENGTH / (FOCAL_LENGTH + particle.z);

      const projectedX =
        (particle.x - this.ctx.canvas.width / 2) * perspective +
        this.ctx.canvas.width / 2;
      const projectedY =
        (particle.y - this.ctx.canvas.height / 2) * perspective +
        this.ctx.canvas.height / 2;
      const projectedSize = particle.baseSize * perspective;

      this.ctx.save();
      this.ctx.globalAlpha = particle.alpha;
      this.ctx.fillStyle = particle.color;
      this.ctx.shadowBlur = 10;
      this.ctx.shadowColor = particle.color;

      this.ctx.translate(projectedX, projectedY);
      this.ctx.beginPath();

      const shape = particle.shape || 'circle';
      const size = Math.max(0, projectedSize);
      switch (shape) {
        case 'square':
          this.ctx.rect(-size / 2, -size / 2, size, size);
          break;
        case 'triangle':
          this.ctx.moveTo(0, -size / 2);
          this.ctx.lineTo(size * 0.433, size / 4);
          this.ctx.lineTo(-size * 0.433, size / 4);
          this.ctx.closePath();
          break;
        case 'circle':
        default:
          this.ctx.arc(0, 0, size, 0, Math.PI * 2);
          break;
      }

      this.ctx.fill();

      this.ctx.restore();
    });
  }

  private drawFogSpots() {
    this.fogSpots.forEach((spot) => {
      this.ctx.save();
      this.ctx.globalAlpha = Math.max(0, spot.alpha);
      this.ctx.fillStyle = spot.color;

      // Create a radial gradient for a soft, foggy effect
      const gradient = this.ctx.createRadialGradient(
        0,
        0,
        0,
        0,
        0,
        spot.size / 2
      );
      gradient.addColorStop(0, spot.color);
      gradient.addColorStop(1, 'transparent');
      this.ctx.fillStyle = gradient;

      this.ctx.translate(spot.x, spot.y);
      this.ctx.rotate(spot.rotation);

      this.ctx.beginPath();
      switch (spot.shape) {
        case 'circle':
          this.ctx.arc(0, 0, spot.size / 2, 0, Math.PI * 2);
          break;
        case 'rectangle':
          // A 2:1 rectangle
          this.ctx.rect(
            -spot.size / 2,
            -spot.size / 4,
            spot.size,
            spot.size / 2
          );
          break;
        case 'triangle':
          // Equilateral triangle
          this.ctx.moveTo(0, -spot.size / 2);
          this.ctx.lineTo((spot.size / 2) * 0.866, spot.size / 4);
          this.ctx.lineTo(-(spot.size / 2) * 0.866, spot.size / 4);
          this.ctx.closePath();
          break;
      }
      this.ctx.fill();
      this.ctx.restore();
    });
  }

  private animate() {
    const canvas = this.canvasRef.nativeElement;
    this.ctx.fillStyle = 'rgba(10, 14, 39, 0.1)';
    this.ctx.fillRect(0, 0, canvas.width, canvas.height);

    this.updateParticles();

    // Draw fog spots underneath the particles for a better depth effect
    this.drawFogSpots();
    this.drawParticles();

    this.animationId = requestAnimationFrame(() => this.animate());
  }
}
