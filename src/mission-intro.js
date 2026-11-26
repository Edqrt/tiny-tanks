import { MUSIC_PATTERNS, MUSIC_ARRANGEMENTS } from './music-score.js';

// Share the original song's first two bars, including dynamics and note lengths.
export const INTRO_SECONDS = 4;
export const INTRO_TICKS = 3840;
const snare = MUSIC_ARRANGEMENTS['brown:1'].parts.snare;
export const INTRO_NOTES = MUSIC_PATTERNS[snare].filter(([tick]) => tick < INTRO_TICKS);
