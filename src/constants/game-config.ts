export const GAME_CONFIG = {
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
    ultimateThreshold: 35,
    progressBarGradients: [
        'linear-gradient(90deg, #00ffff 0%, #00ff00 50%, #ffd700 100%)',
        'linear-gradient(90deg, #ff00ff 0%, #ff6ec7 50%, #7b68ee 100%)',
        'linear-gradient(90deg, #ff6600 0%, #ffff00 50%, #ff0000 100%)',
    ],
    sounds: {
        comboSounds: [
            'bum.mp3',
            'crush.mp3',
            'smash.mp3',
            'bam.mp3',
            'booom.mp3',
        ],
    },
    levelNotificationDurationMs: 1200,
    cosmicParticle: {
        colors: [
            '#4a9eff',
            '#7b68ee',
            '#00ffff',
            '#ff6ec7',
            '#ffd700',
            '#ffffff',
        ],
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
