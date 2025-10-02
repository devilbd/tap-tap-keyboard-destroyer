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

const CRUSH_KEYS_STORAGE_KEY = 'crush_keys';
const BOOSTERS_STORAGE_KEY = 'crush_boosters';
const TIME_BOOSTERS_STORAGE_KEY = 'time_boosters';

@Injectable({
    providedIn: 'root',
})
export class GameManagerService {
    // Game State as Signals
    crushKeys: WritableSignal<number> = signal(0);
    sessionScore = signal(0);
    finalSessionScore = signal(0);
    comboStats = signal<Map<string, number>>(new Map());
    finalComboStats = signal<Map<string, number>>(new Map());
    ultimateComboCounter = signal(0);
    isUltimateReady = computed(
        () => this.ultimateComboCounter() >= GAME_CONFIG.ultimateThreshold
    );
    boosters: WritableSignal<number> = signal(0);
    timeBoosters: WritableSignal<number> = signal(0);
    level = signal(1);
    progress = signal(0);
    progressTarget = signal(100);
    timer = signal(0);
    isGameOver = signal(false);
    isGameStarted = signal(false);
    showLevelUp = signal(false);
    countdownValue: WritableSignal<string | null> = signal(null);

    private gameTimerInterval: number | undefined;
    private isBrowser = false;

    constructor() {
        this.isBrowser = isPlatformBrowser(inject(PLATFORM_ID));
        if (this.isBrowser) {
            this.loadCrushKeys();
            this.loadBoosters();
            this.loadTimeBoosters();
            // Save crush keys whenever they change
            effect(() => {
                this.saveCrushKeys(this.crushKeys());
            });
            // Save boosters whenever they change
            effect(() => {
                this.saveBoosters(this.boosters());
            });
            // Save time boosters whenever they change
            effect(() => {
                this.saveTimeBoosters(this.timeBoosters());
            });
        }
    }

    private loadCrushKeys() {
        if (!this.isBrowser) return;
        const savedKeys = localStorage.getItem(CRUSH_KEYS_STORAGE_KEY);
        if (savedKeys) {
            this.crushKeys.set(parseInt(savedKeys, 10) || 0);
        }
    }

    public saveCrushKeys(keys: number) {
        if (!this.isBrowser) return;
        localStorage.setItem(CRUSH_KEYS_STORAGE_KEY, keys.toString());
    }

    private loadBoosters() {
        if (!this.isBrowser) return;
        const savedBoosters = localStorage.getItem(BOOSTERS_STORAGE_KEY);
        if (savedBoosters) {
            this.boosters.set(parseInt(savedBoosters, 10) || 0);
        }
    }

    private saveBoosters(boosters: number) {
        if (!this.isBrowser) return;
        localStorage.setItem(BOOSTERS_STORAGE_KEY, boosters.toString());
    }

    private loadTimeBoosters() {
        if (!this.isBrowser) return;
        const savedBoosters = localStorage.getItem(TIME_BOOSTERS_STORAGE_KEY);
        if (savedBoosters) {
            this.timeBoosters.set(parseInt(savedBoosters, 10) || 0);
        }
    }

    private saveTimeBoosters(boosters: number) {
        if (!this.isBrowser) return;
        localStorage.setItem(TIME_BOOSTERS_STORAGE_KEY, boosters.toString());
    }

    addBooster(amount: number) {
        this.boosters.update((current) => current + amount);
    }

    addTimeBooster(amount: number) {
        this.timeBoosters.update((current) => current + amount);
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

    addScore(points: number) {
        if (this.isGameOver()) return;
        this.sessionScore.update((current) => current + points);
        this.progress.update((current) => current + points);
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

    recordBigCombo() {
        if (this.isUltimateReady()) return;
        this.ultimateComboCounter.update((c) => c + 1);
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
        this.progress.set(0);
        this.updateProgressTarget();
        this.ultimateComboCounter.set(0);
        this.comboStats.set(new Map());

        this.countdownValue.set('3');
        setTimeout(() => this.countdownValue.set('2'), 1000);
        setTimeout(() => this.countdownValue.set('1'), 2000);
        setTimeout(() => this.countdownValue.set('GO!'), 3000);
        setTimeout(() => {
            this.countdownValue.set(null);
            this.isGameStarted.set(true);
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
        this.crushKeys.update((current) => current + this.sessionScore());
        this.stopGameTimer();
    }
}
