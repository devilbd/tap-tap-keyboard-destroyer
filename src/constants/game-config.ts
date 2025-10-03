export const GAME_CONFIG = {
    baseParticleCount: 200,
    maxParticles: 600, // A hard cap to prevent performance degradation
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
    blackHole: {
        comboThreshold: 70,
        durationMs: 15000, // 15 seconds
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
                particleCount: { min: 5, max: 13 },
                particleSize: { min: 35, max: 45 },
                particleSpeed: { min: 8, max: 16 },
                score: 1,
                probability: 0.75, // 75% chance
            },
            medium: {
                particleCount: { min: 20, max: 30 },
                particleSize: { min: 45, max: 60 },
                particleSpeed: { min: 12, max: 24 },
                score: 5,
                probability: 0.2, // 20% chance
            },
            large: {
                particleCount: { min: 35, max: 50 },
                particleSize: { min: 55, max: 70 },
                particleSpeed: { min: 16, max: 32 },
                score: 20,
                probability: 0.05, // 5% chance
            },
            highStrike: {
                particleCount: { min: 75, max: 100 },
                particleSize: { min: 55, max: 70 },
                particleSpeed: { min: 20, max: 40 },
                score: 50,
                probability: 0, // Not triggered by random chance
            },
        },
    },
};
