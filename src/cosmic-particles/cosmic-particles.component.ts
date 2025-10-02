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
import { RouterLink } from '@angular/router';
import { GAME_CONFIG } from '../constants/game-config';
import { GameManagerService } from '../game-manager/game-manager.service';
import packageInfo from '../../package.json';

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
    prevX?: number;
    prevY?: number;
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

interface Stripe {
    radius: number; // distance from center
    angle: number; // current angle
    speed: number; // angular speed
    length: number; // length of the stripe (as an angle)
    width: number; // thickness of the stripe
    alpha: number;
}

interface WarpGate {
    x: number;
    y: number;
    radius: number;
    vx: number;
    vy: number;
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
    imports: [CommonModule, RouterLink],
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
    private stripes: Stripe[] = [];
    private warpGate!: WarpGate;
    private accretionDiskAngle = 0;
    private vortexAngle = 0;
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
    comboText: { text: string; style: any } | null = null;
    currentProgressBarGradient = GAME_CONFIG.progressBarGradients[0];

    consoleLogs: string[] = [];
    gameVersion = packageInfo.version;

    constructor(
        private cdr: ChangeDetectorRef,
        private analytics: Analytics,
        public gameManager: GameManagerService
    ) {}

    restartGame(): void {
        this.stopAllIntervals();
        if (this.animationId) {
            cancelAnimationFrame(this.animationId);
        }
        this.consoleLogs = [];
        this.particles = [];
        this.fogSpots = [];
        this.stripes = [];
        this.initializeWarpGate();
        this.keyCooldowns.clear();
        this.lastPressTimes.clear();
        this.activeKeys.clear();
        this.comboKeyTimestamps = [];
        this.mobileTapTimestamps = [];
        this.comboText = null;
        this.currentProgressBarGradient = GAME_CONFIG.progressBarGradients[0];
        this.lastTouchCount = 0;
        this.initializeParticles();
        this.initializeStripes();
        this.animate();
        this.gameManager.restartGame(); // This method is for starting a new game
    }

    goToHome(): void {
        this.stopAllIntervals();
        this.gameManager.goToHome();
    }

    playAgain(): void {
        this.gameManager.restartGame();
    }

    startGame(): void {
        this.gameManager.startGame();
        this.startCooldownDecay();
        this.logToConsole('Game Started!');
    }

    getProgressBarGradient(): string {
        return this.currentProgressBarGradient;
    }

    ngAfterViewInit() {
        const canvas = this.canvasRef.nativeElement;
        this.ctx = canvas.getContext('2d')!;

        this.resizeCanvas();
        this.initializeParticles();
        this.initializeStripes();
        this.initializeWarpGate();
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
        this.initializeStripes();
        this.initializeWarpGate();
    }

    @HostListener('mousedown', ['$event'])
    onMouseDown(event: MouseEvent) {
        if (this.gameManager.isGameOver() || !this.gameManager.isGameStarted())
            return;
        this.handleInteraction(event.clientX, event.clientY);
    }

    @HostListener('touchstart', ['$event'])
    onTouchStart(event: TouchEvent) {
        if (this.gameManager.isGameOver() || !this.gameManager.isGameStarted())
            return;
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

    onBoosterButtonClick() {
        this.triggerCrushBooster();
    }

    onBoosterButtonTouch(event: Event) {
        event.preventDefault();
        this.triggerCrushBooster();
    }

    onTimeBoosterButtonTouch(event: Event) {
        event.preventDefault();
        this.triggerTimeBooster();
    }

    onUltimateButtonTouch(event: Event) {
        event.preventDefault();
        this.triggerUltimate();
    }

    onTimeBoosterButtonClick() {
        this.triggerTimeBooster();
    }

    onUltimateButtonClick() {
        this.triggerUltimate();
    }

    @HostListener('window:keydown', ['$event'])
    onKeyDown(event: KeyboardEvent) {
        if (event.key === 'Enter' || event.key === '1') {
            event.preventDefault();
            this.triggerCrushBooster();
            return;
        }
        if (event.key === '2') {
            event.preventDefault();
            this.triggerTimeBooster();
            return;
        }
        if (event.key === '3') {
            event.preventDefault();
            this.triggerUltimate();
            return;
        }
        // Prevent default browser actions for other number keys if needed
        if (event.key >= '0' && event.key <= '9') {
            event.preventDefault();
            return;
        }
        if (this.gameManager.isGameOver() || !this.gameManager.isGameStarted())
            return;

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

    private processCombo(comboIdentifier?: string, x?: number, y?: number) {
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

            this.consumeParticlesAt(comboX, comboY);
        }

        const { keyFatigue } = GAME_CONFIG;
        const lastPress = this.lastPressTimes.get(comboIdentifier) || 0;

        if (currentTime - lastPress < keyFatigue.comboCooldownMs) {
            this.logToConsole(`Combo '${comboIdentifier}' on cooldown.`);
            return;
        }

        // If x and y are provided (like from a booster), use them. Otherwise, default to center.
        const { width, height } = this.canvasRef.nativeElement;
        const comboX = x ?? width / 2;
        const comboY = y ?? height / 2;
        const comboText = this.triggerComboText(comboX, comboY);
        this.consumeParticlesAt(comboX, comboY);
        this.nudgeWarpGate(comboX, comboY);
        this.gameManager.recordCombo(comboText);
        this.gameManager.recordBigCombo();
        this.logToConsole(`High Strike! Combo: '${comboIdentifier}'`);
        logEvent(this.analytics, 'high_strike_combo', {
            combo_keys: comboIdentifier,
            level: this.gameManager.level(),
        });
        this.playRandomComboSound();

        this.gameManager.addScore(GAME_CONFIG.explosion.types.highStrike.score);
        this.lastPressTimes.set(comboIdentifier, currentTime);
        this.comboKeyTimestamps = [];
        this.activeKeys.clear(); // Consume the keys
    }

    private processInput(identifier: string, x: number, y: number) {
        if (this.gameManager.isGameOver() || !this.gameManager.isGameStarted())
            return;

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

        // Check if there are particles nearby before awarding score
        const hitRadius = 50; // Radius to check for particles
        const particlesNearby = this.particles.some((p) => {
            // Only consider particles that are "in front" and visible
            if (p.z <= 0 || p.alpha <= 0) {
                return false;
            }
            // Use the same projection logic as rendering to check against screen coordinates
            const perspective = FOCAL_LENGTH / (FOCAL_LENGTH + p.z);
            const projectedX =
                (p.x - this.ctx.canvas.width / 2) * perspective +
                this.ctx.canvas.width / 2;
            const projectedY =
                (p.y - this.ctx.canvas.height / 2) * perspective +
                this.ctx.canvas.height / 2;

            const distance = Math.sqrt(
                Math.pow(projectedX - x, 2) + Math.pow(projectedY - y, 2)
            );
            return distance < hitRadius;
        });

        if (!particlesNearby) {
            this.logToConsole(
                `Input '${identifier}' hit an empty space. No score.`
            );
            return;
        }

        // Valid press, update timers
        this.lastPressTimes.set(identifier, currentTime);
        this.logToConsole(`Input '${identifier}' processed.`);

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
        this.lastKeyPressTime = currentTime;
        this.gameManager.addScore(progressIncrement);
    }

    @HostListener('window:keyup', ['$event'])
    onKeyUp(event: KeyboardEvent) {
        if (this.gameManager.isGameOver() || !this.gameManager.isGameStarted())
            return;

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
        const comboText = this.triggerComboText(
            this.canvasRef.nativeElement.width / 2,
            this.canvasRef.nativeElement.height / 2
        );
        this.gameManager.recordCombo(comboText);
        this.gameManager.recordBigCombo();
        this.processCombo(comboIdentifier);
        this.lastPressTimes.set(comboIdentifier, currentTime);
    }

    private triggerCrushBooster() {
        if (
            this.gameManager.isGameOver() ||
            !this.gameManager.isGameStarted() ||
            !this.gameManager.spendBooster(1)
        ) {
            return;
        }

        this.logToConsole('CRUSH BOOSTER ACTIVATED!');

        for (let i = 0; i < 10; i++) {
            setTimeout(() => {
                const { width, height } = this.canvasRef.nativeElement;
                const x = Math.random() * width;
                const y = Math.random() * height;
                this.processCombo(`booster-${i}`, x, y);
            }, i * 100); // 100ms delay between each combo
        }
    }

    private triggerTimeBooster() {
        if (
            this.gameManager.isGameOver() ||
            !this.gameManager.isGameStarted() ||
            !this.gameManager.spendTimeBooster(1)
        ) {
            return;
        }

        this.gameManager.addTime(15);
        this.logToConsole('TIME BOOSTER ACTIVATED! +15s');
    }

    private triggerUltimate() {
        if (
            this.gameManager.isGameOver() ||
            !this.gameManager.isGameStarted() ||
            !this.gameManager.useUltimate()
        ) {
            return;
        }

        this.logToConsole('ULTIMATE ACTIVATED!');

        for (let i = 0; i < 20; i++) {
            setTimeout(() => {
                this.processCombo(
                    `ultimate-${i}`,
                    Math.random() * this.canvasRef.nativeElement.width,
                    Math.random() * this.canvasRef.nativeElement.height
                );
            }, i * 50); // A faster 50ms delay between each combo
        }
    }

    private playSound(soundFile: string): void {
        const audio = new Audio(`assets/sounds/${soundFile}`);
        audio
            .play()
            .catch((error) => console.error(`Error playing sound:`, error));
    }

    private playRandomComboSound(): void {
        const { comboSounds } = GAME_CONFIG.sounds;
        if (comboSounds.length > 0) {
            const soundFile =
                comboSounds[Math.floor(Math.random() * comboSounds.length)];
            this.playSound(soundFile);
        }
    }

    private nudgeWarpGate(targetX: number, targetY: number) {
        const nudgeStrength = 0.2; // How strongly the combo pulls the gate
        const maxVelocity = 3; // Prevent it from moving too fast

        const dx = targetX - this.warpGate.x;
        const dy = targetY - this.warpGate.y;
        const distance = Math.sqrt(dx * dx + dy * dy);

        if (distance > 1) {
            // Add a velocity component towards the combo
            this.warpGate.vx += (dx / distance) * nudgeStrength;
            this.warpGate.vy += (dy / distance) * nudgeStrength;

            // Clamp the velocity to the max speed
            this.warpGate.vx = Math.max(
                -maxVelocity,
                Math.min(maxVelocity, this.warpGate.vx)
            );
            this.warpGate.vy = Math.max(
                -maxVelocity,
                Math.min(maxVelocity, this.warpGate.vy)
            );
        }
    }

    private consumeParticlesAt(x: number, y: number) {
        const consumptionRadius = 150; // The area of effect for the combo
        this.particles.forEach((p) => {
            const dx = x - p.x;
            const dy = y - p.y;
            const distance = Math.sqrt(dx * dx + dy * dy);

            if (distance < consumptionRadius) {
                // Mark for consumption by giving it a negative life
                p.life = -1;
                // Give it a strong velocity towards the center of the combo
                const force = 2; // Adjust for a stronger pull
                p.vx = (dx / distance) * force * 5;
                p.vy = (dy / distance) * force * 5;
            }
        });
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

    private triggerComboText(x: number, y: number): string {
        const comboTexts = ['BUM', 'BAM', 'CRUSH', 'BOOOM', 'SMASH'];

        const baseText =
            comboTexts[Math.floor(Math.random() * comboTexts.length)];
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
        return baseText;
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

    private initializeWarpGate() {
        const canvas = this.canvasRef.nativeElement;
        this.warpGate = {
            x: canvas.width / 2,
            y: canvas.height / 2,
            radius: 50, // Make the black hole smaller
            vx: (Math.random() - 0.5) * 2,
            vy: (Math.random() - 0.5) * 2,
        };
    }

    private initializeStripes() {
        this.stripes = [];
        const canvas = this.canvasRef.nativeElement;
        const numStripes = 200;
        const maxRadius = Math.sqrt(
            Math.pow(canvas.width / 2, 2) + Math.pow(canvas.height / 2, 2)
        );

        for (let i = 0; i < numStripes; i++) {
            this.stripes.push({
                radius: Math.random() * maxRadius,
                angle: Math.random() * Math.PI * 2,
                speed:
                    (Math.random() * 0.001 + 0.0005) *
                    (Math.random() < 0.5 ? 1 : -1),
                length: Math.random() * 0.02 + 0.01,
                width: Math.random() * 2 + 1,
                alpha: Math.random() * 0.2 + 0.1,
            });
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
            this.particles.push(
                this.createExplosionParticle(x, y, explosionType)
            );
        }
    }

    private createExplosionParticle(
        x: number,
        y: number,
        config: ExplosionType
    ): Particle {
        const angle = Math.random() * Math.PI * 2; // Random direction
        const speed =
            Math.random() *
                (config.particleSpeed.max - config.particleSpeed.min) +
            config.particleSpeed.min;

        // Determine size based on explosion type to create more visual distinction
        const sizeMultiplier =
            config.score > 10 ? 1.5 : config.score > 1 ? 1.2 : 1;
        const baseSize =
            (Math.random() *
                (config.particleSize.max - config.particleSize.min) +
                config.particleSize.min) *
            sizeMultiplier;

        const colors = GAME_CONFIG.explosion.colors;
        const shapes: Particle['shape'][] = ['circle', 'square', 'triangle'];

        return {
            x: x + (Math.random() - 0.5) * 40, // Start in a small area
            y: y + (Math.random() - 0.5) * 40,
            z: 0,
            vx: Math.cos(angle) * speed,
            vy: Math.sin(angle) * speed,
            vz: (Math.random() - 0.5) * speed, // Give it 3D velocity
            baseSize,
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

                    const force =
                        (1 - distance / scatterRadius) * scatterStrength;
                    const angle = Math.atan2(dy, dx);

                    particle.vx += Math.cos(angle) * force;
                    particle.vy += Math.sin(angle) * force;
                }
            }
        });
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

    private updateWarpGate() {
        const canvas = this.canvasRef.nativeElement;
        const gate = this.warpGate;

        gate.x += gate.vx;
        gate.y += gate.vy;

        // Ensure the entire rectangle stays within the canvas bounds
        if (gate.x - gate.radius < 0) {
            gate.x = gate.radius;
            gate.vx *= -1;
        } else if (gate.x + gate.radius > canvas.width) {
            gate.x = canvas.width - gate.radius;
            gate.vx *= -1;
        }
        if (gate.y - gate.radius < 0) {
            gate.y = gate.radius;
            gate.vy *= -1;
        } else if (gate.y + gate.radius > canvas.height) {
            gate.y = canvas.height - gate.radius;
            gate.vy *= -1;
        }
    }

    private updateStripes() {
        const canvas = this.canvasRef.nativeElement;
        this.stripes.forEach((stripe) => {
            stripe.angle += stripe.speed;
            // Slowly pull stripes towards the warp gate
            stripe.radius -= 0.05;
            if (stripe.radius < 0)
                stripe.radius = Math.max(canvas.width, canvas.height) / 2;
        });
    }

    private updateParticles() {
        this.particles = this.particles.filter((particle) => {
            // Add gravitational pull from the warp gate for cosmic particles
            if (particle.vz === 0) {
                const dx = this.warpGate.x - particle.x;
                const dy = this.warpGate.y - particle.y;
                const distSq = dx * dx + dy * dy;
                const pullRadius = this.warpGate.radius * 3;

                if (particle.life < 0) {
                    // This particle is being consumed by a combo, accelerate its demise
                    particle.life += 0.1; // Moves towards 0 from negative
                    particle.alpha = Math.max(0, 1 + particle.life * 10);
                }
                // If inside the event horizon, consume the particle
                if (distSq < this.warpGate.radius * this.warpGate.radius) {
                    particle.life = 0; // Mark for removal
                } else if (distSq < pullRadius * pullRadius) {
                    // If within the gravitational pull area, affect its velocity
                    const dist = Math.sqrt(distSq);
                    const force = (1 - dist / pullRadius) * 0.2; // Adjust strength of the pull
                    particle.vx += (dx / dist) * force;
                    particle.vy += (dy / dist) * force;
                }
            }

            particle.x += particle.vx;
            particle.y += particle.vy;

            particle.prevX = particle.x;
            particle.prevY = particle.y;

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

    private drawStripes() {
        const { x, y, radius } = this.warpGate;

        this.ctx.save();
        // Create a clipping region for the "hole"
        this.ctx.beginPath();
        this.ctx.arc(x, y, radius, 0, Math.PI * 2);
        this.ctx.clip();

        // Clear the inside of the hole to create the void effect
        this.ctx.clearRect(0, 0, this.ctx.canvas.width, this.ctx.canvas.height);
        this.ctx.restore();

        // Draw the vortex, which will now have a hole in it
        this.ctx.save();
        this.ctx.translate(x, y);
        this.ctx.rotate(this.vortexAngle);
        this.stripes.forEach((stripe) => {
            this.ctx.beginPath();
            this.ctx.arc(
                0,
                0,
                stripe.radius,
                stripe.angle,
                stripe.angle + stripe.length
            );
            // Make stripes more colorful
            const hue = (stripe.angle * 30) % 360;
            this.ctx.strokeStyle = `hsla(${hue}, 100%, 70%, ${stripe.alpha})`;
            this.ctx.lineWidth = stripe.width;
            this.ctx.stroke();
        });
        this.ctx.restore();
    }

    private drawAccretionDisk() {
        const { x, y, radius } = this.warpGate;
        this.ctx.save();
        this.ctx.translate(x, y);

        const ringCount = 3;
        const ringSpacing = 15;

        for (let i = 0; i < ringCount; i++) {
            this.ctx.beginPath();
            // Each ring gets its own speed multiplier.
            const speedMultiplier = 1 + i * 0.5;
            const startAngle = this.accretionDiskAngle * speedMultiplier;
            // The end angle determines the length of the arc.
            const endAngle = startAngle + Math.PI * 1.5;
            const ringRadius = radius + 5 + i * ringSpacing;
            this.ctx.arc(0, 0, ringRadius, startAngle, endAngle);
            // Make the rings more transparent for a subtler effect.
            this.ctx.strokeStyle = `rgba(255, 255, 255, ${0.05 + i * 0.03})`;
            this.ctx.lineWidth = 1 + i * 0.5;
            this.ctx.stroke();
        }
        this.ctx.restore();
    }

    private animate() {
        const canvas = this.canvasRef.nativeElement;
        this.ctx.fillStyle = 'rgba(10, 14, 39, 0.1)';
        this.ctx.fillRect(0, 0, canvas.width, canvas.height);

        this.vortexAngle += 0.0005;
        this.updateWarpGate();
        this.accretionDiskAngle -= 0.002; // Rotate faster and in the opposite direction
        this.updateStripes();
        this.updateParticles();

        this.drawStripes();
        // Draw fog spots underneath the particles for a better depth effect
        this.drawAccretionDisk();
        this.drawFogSpots();
        this.drawParticles();

        this.animationId = requestAnimationFrame(() => this.animate());
    }
}
