export const MODULE_ID = "otherworldly-visions";
export const MODULE_VERSION = "1.0.13";
export const SCHEMA_VERSION = 2;

export const FLAGS = Object.freeze({
  TOUCHED: "touched",
  OTHERWORLDLY: "otherworldly",
  CLIENT_STATUS: "clientStatus"
});

export const SETTINGS = Object.freeze({
  STATE: "state",
  LEGACY_VISION_SETS: "visionSets",
  FLASH_ENABLED: "flashEnabled",
  DEBUG: "debug",
  COMMAND: "commandEnvelope",
  SESSION_LOG: "sessionLog",
  MIGRATION_BACKUP: "migrationBackup",
  MIGRATION_COMPLETE: "migrationComplete",
  MACRO_UUID: "managerMacroUuid",
  DIRECT_FALLBACK: "directVisibilityFallback",
  PLAYER_FLASH: "playerFlashEnabled",
  SCHEDULE_STATE: "scheduleState",
  VOLUME_CAP: "volumeCap",
  OPACITY_CAP: "opacityCap",
  REDUCED_MOTION: "reducedMotion",
  PHOTOSENSITIVE: "photosensitiveMode",
  BLOCKED_SAFETY_TAGS: "blockedSafetyTags",
  ALLOW_HIDDEN: "allowHiddenTabPlayback",
  MIN_INTERVAL: "minimumCueInterval",
  EMERGENCY_MUTE: "emergencyMute"
});

export const IMAGE_EXTENSIONS = [".apng", ".avif", ".bmp", ".gif", ".jpeg", ".jpg", ".png", ".svg", ".webp"];
export const AUDIO_EXTENSIONS = [".aac", ".flac", ".m4a", ".mid", ".midi", ".mp3", ".ogg", ".opus", ".wav", ".webm"];
export const FILEPICKER_SOURCES = ["data", "public", "s3"];

export const PRIORITY = Object.freeze({ RANDOM: 10, TRIGGER: 30, MANUAL: 80, EMERGENCY: 100 });
export const CONFLICT = Object.freeze({ QUEUE: "queue", DROP: "drop", REPLACE: "replace", REPLACE_LOWER: "replace-lower" });

export const DEFAULT_TOUCHED = Object.freeze({
  schemaVersion: SCHEMA_VERSION,
  enabled: false,
  rank: 1,
  tags: [],
  visionSetUuids: [],
  revelations: {}
});

export const DEFAULT_OTHERWORLDLY = Object.freeze({
  schemaVersion: SCHEMA_VERSION,
  enabled: false,
  requiredRank: 1,
  requiredTags: [],
  viewerOpacity: 1,
  visualEffect: "void",
  effectIntensity: 1,
  revealStage: 4,
  fullGhost: true,
  suppressLight: true,
  suppressVision: true,
  hideCombatant: true,
  maxDistance: 0,
  requireLineOfSight: false,
  minDarkness: 0,
  maxDarkness: 1,
  intermittentMinDelay: 5,
  intermittentMaxDelay: 14,
  intermittentDuration: 1.5,
  conditions: []
});

export const DEFAULT_ENTRY = Object.freeze({
  id: "",
  image: "",
  audio: "",
  weight: 1,
  duration: 0,
  caption: "",
  tags: [],
  safety: [],
  cooldown: 0,
  enabled: true
});

export const DEFAULT_SEQUENCE_STEP = Object.freeze({
  id: "",
  delay: 0,
  duration: 350,
  image: "",
  audio: "",
  caption: "",
  transition: "fade"
});

export const DEFAULT_TRIGGER = Object.freeze({
  id: "",
  enabled: true,
  type: "manual",
  chance: 1,
  cooldown: 0,
  config: {}
});

export const DEFAULT_VISION_SET = Object.freeze({
  uuid: "",
  legacyIds: [],
  slug: "",
  name: "Vision Set",
  enabled: true,
  safety: [],
  images: [],
  audio: [],
  playlistIds: [],
  entries: [],
  sequence: [],
  triggers: [],
  minDelay: 45,
  maxDelay: 180,
  chance: 0.35,
  cooldown: 0,
  noRepeatWindow: 2,
  minOpacity: 0.18,
  maxOpacity: 0.65,
  minDuration: 120,
  maxDuration: 650,
  audioChance: 1,
  minVolume: 0.45,
  maxVolume: 0.75,
  minScale: 1,
  maxScale: 1.08,
  minRotation: -2,
  maxRotation: 2,
  maxBlur: 0.8,
  blendMode: "screen",
  fitMode: "auto",
  edgeFade: true,
  edgeFadeSize: 12,
  vignette: true
});
