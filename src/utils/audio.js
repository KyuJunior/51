// src/utils/audio.js
/**
 * Procedural Web Audio Engine for zero-dependency casino sound effects.
 * No external .mp3 files mean instant loading and zero bandwidth overhead.
 */

// Initialize Audio Context locally (lazy init so it only runs on user interaction)
let audioCtx = null;

function initAudio() {
  if (!audioCtx) {
    audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  }
  if (audioCtx.state === 'suspended') {
    audioCtx.resume();
  }
}

/**
 * A sharp, heavy 'thud' representing a card hitting a wooden felt table.
 */
export function playCardSnap() {
  try {
    initAudio();
    const duration = 0.1;
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();

    // Quick frequency sweep down to simulate a sharp impact
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(150, audioCtx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(40, audioCtx.currentTime + duration);

    // Sharp attack, fast decay
    gain.gain.setValueAtTime(0, audioCtx.currentTime);
    gain.gain.linearRampToValueAtTime(0.3, audioCtx.currentTime + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + duration);

    osc.connect(gain);
    gain.connect(audioCtx.destination);
    
    osc.start();
    osc.stop(audioCtx.currentTime + duration);
  } catch (e) { console.warn('Audio play failed', e); }
}

/**
 * A fast, breathy 'whoosh' simulating a card flying from the deck.
 */
export function playDraw() {
  try {
    initAudio();
    const duration = 0.15;
    
    // We simulate the 'whoosh' with a heavily filtered oscillator array
    const osc = audioCtx.createOscillator();
    const filter = audioCtx.createBiquadFilter();
    const gain = audioCtx.createGain();

    osc.type = 'sine';
    osc.frequency.setValueAtTime(400, audioCtx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(1200, audioCtx.currentTime + duration);

    filter.type = 'bandpass';
    filter.frequency.value = 1000;
    
    // Volume envelope
    gain.gain.setValueAtTime(0, audioCtx.currentTime);
    gain.gain.linearRampToValueAtTime(0.15, audioCtx.currentTime + 0.05);
    gain.gain.linearRampToValueAtTime(0, audioCtx.currentTime + duration);

    osc.connect(filter);
    filter.connect(gain);
    gain.connect(audioCtx.destination);

    osc.start();
    osc.stop(audioCtx.currentTime + duration);
  } catch (e) { console.warn('Audio play failed', e); }
}

/**
 * A very subtle, rich bell chime for points or positive interactions.
 */
export function playChime() {
  try {
    initAudio();
    const duration = 1.0;
    
    const playNote = (freq, delay) => {
      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();
      
      osc.type = 'sine';
      osc.frequency.value = freq;
      
      const startTime = audioCtx.currentTime + delay;
      gain.gain.setValueAtTime(0, startTime);
      gain.gain.linearRampToValueAtTime(0.1, startTime + 0.05);
      gain.gain.exponentialRampToValueAtTime(0.001, startTime + duration);
      
      osc.connect(gain);
      gain.connect(audioCtx.destination);
      
      osc.start(startTime);
      osc.stop(startTime + duration);
    };

    // Major chord (C5, E5, G5)
    playNote(523.25, 0.0);
    playNote(659.25, 0.05);
    playNote(783.99, 0.1);
  } catch (e) { console.warn('Audio play failed', e); }
}
