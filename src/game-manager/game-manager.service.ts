import {
    computed,
    Injectable,
    signal,
    effect,
    WritableSignal,
    PLATFORM_ID,
    inject,
} from '@angular/core';
import { GAME_CONFIG } from '../constants/game-config';
import { isPlatformBrowser } from '@angular/common';

const GAME_STATE_STORAGE_KEY = 'tap-tap-destroyer-game-state';

interface GameState {
    crushKeys: number;
    boosters: number;
    timeBoosters: number;
    alienCleaners: number;
}

@Injectable({
    providedIn: 'root',
})
export class GameManagerService {
    // Game State as Signals
    crushKeys: WritableSignal<number> = signal(0);
    sessionScore = signal(0);
    alienScoreConsumption = signal(0);
    finalSessionScore = signal(0);
    comboStats = signal<Map<string, number>>(new Map());
    finalComboStats = signal<Map<string, number>>(new Map());
    finalAlienScoreConsumption = signal(0);
    ultimateComboCounter = signal(0);
    isUltimateReady = computed(
        () => this.ultimateComboCounter() >= GAME_CONFIG.ultimateThreshold
    );
    blackHoleComboCounter = signal(0);
    blackHoleComboThreshold = GAME_CONFIG.blackHole.comboThreshold;
    boosters: WritableSignal<number> = signal(0);
    activeBlackHoles = signal(0);
    timeBoosters: WritableSignal<number> = signal(0);
    alienCleaners: WritableSignal<number> = signal(0);
    level = signal(1);
    progress = signal(0);
    progressTarget = signal(100);
    timer = signal(0);
    isGameOver = signal(false);
    isGameStarted = signal(false);
    showLevelUp = signal(false);
    countdownValue: WritableSignal<string | null> = signal(null);

    isBlackHoleActive = computed(() => this.activeBlackHoles() > 0);
    isAlienActive = signal(false);

    private gameTimerInterval: number | undefined;
    private alienScoreInterval: number | undefined;
    private blackHoleDecayInterval: number | undefined;
    private lastHitTime = signal(0);
    private isBrowser = false;

    constructor() {
        this.isBrowser = isPlatformBrowser(inject(PLATFORM_ID));
        if (this.isBrowser) {
            this.loadGameState();
            // Save game state whenever it changes
            effect(() => {
                // This effect will run whenever any of these signals change.
                const state: GameState = {
                    crushKeys: this.crushKeys(),
                    boosters: this.boosters(),
                    timeBoosters: this.timeBoosters(),
                    alienCleaners: this.alienCleaners(),
                };
                this.saveGameState(state);
            });
        }
    }

    private loadGameState() {
        if (!this.isBrowser) return;
        const savedState = localStorage.getItem(GAME_STATE_STORAGE_KEY);
        if (savedState) {
            try {
                const state: GameState = JSON.parse(savedState);
                this.crushKeys.set(state.crushKeys || 0);
                this.boosters.set(state.boosters || 0);
                this.timeBoosters.set(state.timeBoosters || 0);
                this.alienCleaners.set(state.alienCleaners || 0);
            } catch (e) {
                console.error('Failed to parse saved game state:', e);
            }
        }
    }

    private saveGameState(state: GameState) {
        if (!this.isBrowser) return;
        localStorage.setItem(GAME_STATE_STORAGE_KEY, JSON.stringify(state));
    }

    addBooster(amount: number) {
        this.boosters.update((current) => current + amount);
    }

    addTimeBooster(amount: number) {
        this.timeBoosters.update((current) => current + amount);
    }

    addAlienCleaner(amount: number) {
        this.alienCleaners.update((current) => current + amount);
    }

    spendBooster(amount: number): boolean {
        if (this.boosters() >= amount) {
            this.boosters.update((b) => b - amount);
            return true;
        }
        return false;
    }

    spendTimeBooster(amount: number): boolean {
        if (this.timeBoosters() >= amount) {
            this.timeBoosters.update((b) => b - amount);
            return true;
        }
        return false;
    }

    spendAlienCleaner(amount: number): boolean {
        if (this.alienCleaners() >= amount) {
            this.alienCleaners.update((c) => c - amount);
            return true;
        }
        return false;
    }

    addScore(points: number) {
        if (this.isGameOver()) return;
        this.sessionScore.update((current) => current + points);
        this.progress.update((current) => current + points);
        this.lastHitTime.set(Date.now());
        this.updateLevel();
    }

    addTime(seconds: number) {
        if (this.isGameOver()) return;
        this.timer.update((current) => current + seconds);
    }

    spendCrushKeys(amount: number): boolean {
        if (this.crushKeys() >= amount) {
            this.crushKeys.update((current) => current - amount);
            return true;
        }
        return false;
    }

    recordBigCombo(amount: number = 1) {
        if (this.isUltimateReady()) return;
        this.ultimateComboCounter.update((c) => c + amount);
        if (!this.isBlackHoleActive()) {
            this.blackHoleComboCounter.update((c) => c + amount);
            if (
                this.blackHoleComboCounter() >=
                GAME_CONFIG.blackHole.comboThreshold
            ) {
                const rand = Math.random();
                let numBlackHoles = 1;
                // 60% for 1, 25% for 2, 10% for 3, 5% for 4
                if (rand < 0.05) {
                    numBlackHoles = 4;
                } else if (rand < 0.15) {
                    numBlackHoles = 3;
                } else if (rand < 0.4) {
                    numBlackHoles = 2;
                }

                this.activeBlackHoles.set(numBlackHoles);

                setTimeout(() => {
                    this.activeBlackHoles.set(0);
                    this.blackHoleComboCounter.set(0);
                    if (Math.random() < 0.8) {
                        this.spawnAlien();
                    }
                }, GAME_CONFIG.blackHole.durationMs);
            }
        }
    }

    private spawnAlien() {
        if (this.isGameOver()) return;

        this.isAlienActive.set(true);

        // Alien eats score while active
        this.alienScoreInterval = window.setInterval(() => {
            const scoreToDrain = 100;
            this.sessionScore.update((s) => {
                const actualDrained = Math.min(s, scoreToDrain);
                if (actualDrained > 0) {
                    this.alienScoreConsumption.update((c) => c + actualDrained);
                }
                return s - actualDrained;
            });
        }, 1000);

        // Alien disappears after 10 seconds
        setTimeout(() => {
            this.isAlienActive.set(false);
            if (this.alienScoreInterval) {
                clearInterval(this.alienScoreInterval);
                this.alienScoreInterval = undefined;
            }
        }, 10000);
    }

    clearAlien() {
        this.isAlienActive.set(false);
        if (this.alienScoreInterval) {
            clearInterval(this.alienScoreInterval);
            this.alienScoreInterval = undefined;
        }
        // No need for a timeout, it's gone instantly.
    }

    useUltimate(): boolean {
        if (!this.isUltimateReady()) {
            return false;
        }
        this.ultimateComboCounter.set(0);
        return true;
    }

    recordCombo(comboIdentifier: string) {
        this.comboStats().set(
            comboIdentifier,
            (this.comboStats().get(comboIdentifier) || 0) + 1
        );
    }

    startGame() {
        this.isGameStarted.set(false);
        this.isGameOver.set(false);
        this.level.set(1);
        this.sessionScore.set(0);
        this.alienScoreConsumption.set(0);
        this.progress.set(0);
        this.updateProgressTarget();
        this.ultimateComboCounter.set(0);
        this.activeBlackHoles.set(0);
        this.blackHoleComboCounter.set(0);
        this.comboStats.set(new Map());
        if (this.alienScoreInterval) {
            clearInterval(this.alienScoreInterval);
            this.alienScoreInterval = undefined;
        }

        this.countdownValue.set('3');
        setTimeout(() => this.countdownValue.set('2'), 1000);
        setTimeout(() => this.countdownValue.set('1'), 2000);
        setTimeout(() => this.countdownValue.set('GO!'), 3000);
        setTimeout(() => {
            this.countdownValue.set(null);
            this.isGameStarted.set(true);
            this.startBlackHoleDecay();
            this.startGameTimer();
        }, 4000);
    }

    restartGame() {
        this.stopGameTimer();
        this.startGame();
    }

    goToHome() {
        this.stopGameTimer();
        this.isGameOver.set(false);
        this.isGameStarted.set(false);
        this.sessionScore.set(0);
    }

    private startGameTimer() {
        this.stopGameTimer(); // Ensure no multiple timers
        this.timer.set(60); // Set a fixed 60-second timer
        this.gameTimerInterval = window.setInterval(() => {
            this.timer.update((t) => t - 1);
            if (this.timer() <= 0) {
                this.timer.set(0);
                this.endGame();
            }
        }, 1000);
    }

    private stopGameTimer() {
        if (this.gameTimerInterval) {
            clearInterval(this.gameTimerInterval);
            this.gameTimerInterval = undefined;
        }
        if (this.alienScoreInterval) {
            clearInterval(this.alienScoreInterval);
            this.alienScoreInterval = undefined;
        }
        this.stopBlackHoleDecay();
    }

    private startBlackHoleDecay() {
        this.stopBlackHoleDecay(); // Ensure no multiple intervals
        this.blackHoleDecayInterval = window.setInterval(() => {
            if (
                this.blackHoleComboCounter() > 0 &&
                !this.isBlackHoleActive() &&
                this.isGameStarted()
            ) {
                const timeSinceLastHit = Date.now() - this.lastHitTime();
                let decayAmount = 1; // Base decay
                if (timeSinceLastHit > 5000) {
                    decayAmount = 3; // Faster decay after 5 seconds of inactivity
                } else if (timeSinceLastHit > 2000) {
                    decayAmount = 2; // Moderate decay after 2 seconds
                }
                this.blackHoleComboCounter.update((c) =>
                    Math.max(0, c - decayAmount)
                );
            }
        }, 1000); // Check every second
    }

    private stopBlackHoleDecay() {
        if (this.blackHoleDecayInterval) {
            clearInterval(this.blackHoleDecayInterval);
            this.blackHoleDecayInterval = undefined;
        }
    }

    private updateLevel() {
        while (this.progress() >= this.progressTarget()) {
            this.progress.update((p) => p - this.progressTarget());
            this.level.update((l) => l + 1);
            this.updateProgressTarget();

            this.showLevelUp.set(true);
            setTimeout(
                () => this.showLevelUp.set(false),
                GAME_CONFIG.levelNotificationDurationMs
            );
        }
    }

    private updateProgressTarget() {
        const { difficulty } = GAME_CONFIG;
        this.progressTarget.set(
            difficulty.levelTargetBase +
                Math.pow(this.level(), difficulty.levelTargetExponent) *
                    difficulty.levelTargetMultiplier
        );
    }

    endGame() {
        this.isGameOver.set(true);
        this.isGameStarted.set(false);
        this.finalSessionScore.set(this.sessionScore());
        this.finalComboStats.set(new Map(this.comboStats()));
        this.finalAlienScoreConsumption.set(this.alienScoreConsumption());
        this.crushKeys.update((current) => current + this.sessionScore());
        this.stopGameTimer();
    }
}
