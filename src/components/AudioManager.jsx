'use client';

import { forwardRef, useImperativeHandle, useRef } from 'react';

function createOscillator(audioContext, frequency, duration, type = 'sine', gain = 0.04) {
  const oscillator = audioContext.createOscillator();
  const envelope = audioContext.createGain();
  oscillator.type = type;
  oscillator.frequency.setValueAtTime(frequency, audioContext.currentTime);
  envelope.gain.setValueAtTime(0.0001, audioContext.currentTime);
  envelope.gain.exponentialRampToValueAtTime(gain, audioContext.currentTime + 0.02);
  envelope.gain.exponentialRampToValueAtTime(0.0001, audioContext.currentTime + duration);
  oscillator.connect(envelope).connect(audioContext.destination);
  oscillator.start();
  oscillator.stop(audioContext.currentTime + duration + 0.05);
}

const AudioManager = forwardRef(function AudioManager(_, ref) {
  const contextRef = useRef(null);

  const prime = () => {
    if (typeof window === 'undefined') return null;
    if (!contextRef.current) {
      const AudioContext = window.AudioContext || window.webkitAudioContext;
      if (!AudioContext) return null;
      contextRef.current = new AudioContext();
    }
    if (contextRef.current.state === 'suspended') {
      contextRef.current.resume();
    }
    return contextRef.current;
  };

  useImperativeHandle(ref, () => ({
    prime,
    ceramicMove() {
      const audioContext = prime();
      if (!audioContext) return;
      createOscillator(audioContext, 140, 1.15, 'sine', 0.018);
      createOscillator(audioContext, 422, 0.42, 'triangle', 0.012);
    },
    ceramicImpact() {
      const audioContext = prime();
      if (!audioContext) return;
      createOscillator(audioContext, 58, 1.05, 'sine', 0.065);
      createOscillator(audioContext, 296, 0.52, 'triangle', 0.028);
      createOscillator(audioContext, 730, 0.7, 'sine', 0.012);
    },
  }));

  return null;
});

export default AudioManager;
