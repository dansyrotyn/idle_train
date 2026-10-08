# Synthesizes every game sound and the music loop from scratch (no third-party samples).
# Run:  uv run --with numpy tools/gen_sounds.py   → writes assets/audio/*.m4a (needs macOS afconvert)
import os
import subprocess
import tempfile
import wave

import numpy as np

SR = 44100
OUT = os.path.join(os.path.dirname(__file__), '..', 'assets', 'audio')
rng = np.random.default_rng(7)


def t(dur):
    return np.arange(int(SR * dur)) / SR


def note(n):
    """MIDI note → Hz."""
    return 440.0 * 2 ** ((n - 69) / 12)


def env(dur, attack=0.003, decay=8.0):
    x = t(dur)
    return np.minimum(x / attack, 1.0) * np.exp(-x * decay)


def sweep(f0, f1, dur, shape=1.0):
    """Sine whose pitch glides f0 → f1 (exponential glide)."""
    x = t(dur) / dur
    f = f0 * (f1 / f0) ** (x ** shape)
    return np.sin(2 * np.pi * np.cumsum(f) / SR)


def bell(freq, dur, decay=6.0, bright=1.0):
    """Glassy toy bell: fundamental + a few inharmonic partials that die faster."""
    x = t(dur)
    s = np.zeros_like(x)
    for ratio, amp, d in [(1, 1, 1), (2.0, 0.5 * bright, 1.6), (3.01, 0.25 * bright, 2.4), (4.2, 0.12 * bright, 3.5)]:
        s += amp * np.sin(2 * np.pi * freq * ratio * x) * np.exp(-x * decay * d)
    return s * np.minimum(x / 0.002, 1)


def pluck(freq, dur, decay=7.0):
    """Soft square-ish pluck (cute synth lead)."""
    x = t(dur)
    s = np.sin(2 * np.pi * freq * x) + 0.3 * np.sin(2 * np.pi * freq * 3 * x) + 0.12 * np.sin(2 * np.pi * freq * 5 * x)
    return s * env(dur, 0.004, decay)


def noise(dur):
    return rng.uniform(-1, 1, int(SR * dur))


def lowpass(x, cutoff):
    a = np.exp(-2 * np.pi * cutoff / SR)
    y = np.zeros_like(x)
    acc = 0.0
    for i, v in enumerate(x):
        acc = (1 - a) * v + a * acc
        y[i] = acc
    return y


def mix(length, *parts):
    """parts: (start_seconds, signal, gain)."""
    out = np.zeros(int(SR * length))
    for start, sig, gain in parts:
        i = int(start * SR)
        n = min(len(sig), len(out) - i)
        out[i:i + n] += sig[:n] * gain
    return out


def save(name, x, peak=0.9):
    x = x / (np.max(np.abs(x)) + 1e-9) * peak
    fade = min(len(x), int(0.005 * SR))
    x[-fade:] *= np.linspace(1, 0, fade)
    with tempfile.NamedTemporaryFile(suffix='.wav', delete=False) as f:
        path = f.name
    with wave.open(path, 'wb') as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(SR)
        w.writeframes((x * 32767).astype(np.int16).tobytes())
    dst = os.path.join(OUT, f'{name}.m4a')
    subprocess.run(['afconvert', '-f', 'm4af', '-d', 'aac', '-b', '96000', path, dst], check=True)
    os.remove(path)
    print('wrote', name)


# --- UI ---------------------------------------------------------------------------

def button():
    return sweep(1100, 650, 0.06) * env(0.06, 0.001, 60)


def popup():
    return mix(0.3, (0, sweep(350, 1200, 0.12, 0.6) * env(0.12, 0.005, 18), 1),
               (0.07, bell(note(84), 0.25, 9), 0.35))


# --- actions ------------------------------------------------------------------------

def car_add():
    # Bubbly pop + a little "ding" on top.
    pop = sweep(260, 900, 0.09, 0.5) * env(0.09, 0.002, 30)
    return mix(0.35, (0, pop, 1), (0.05, bell(note(88), 0.3, 10), 0.3))


def merge():
    # Two rising whooshes that meet, then a sparkly chord.
    a = sweep(300, 700, 0.12) * env(0.12, 0.01, 10)
    b = sweep(450, 1050, 0.12) * env(0.12, 0.01, 10)
    chord = sum(bell(note(n), 0.6, 5) for n in (76, 79, 84))
    sparkle = sum(bell(note(n), 0.25, 14) for n in (91, 96))
    return mix(0.75, (0, a, 0.6), (0.02, b, 0.5), (0.12, chord, 0.5), (0.16, sparkle, 0.25))


def gate_add():
    # Cash-register style purchase: two bright bells + shimmer.
    shimmer = lowpass(noise(0.35), 9000) * env(0.35, 0.01, 10) * np.sin(2 * np.pi * 30 * t(0.35)) ** 2
    return mix(0.7, (0, bell(note(88), 0.5, 6), 0.6), (0.09, bell(note(95), 0.6, 5), 0.6), (0.05, shimmer, 0.15))


def track_upgrade():
    rise = sweep(220, 880, 0.4, 1.5) * env(0.4, 0.05, 2)
    chord = sum(pluck(note(n), 0.8, 4) for n in (60, 64, 67, 72))
    top = sum(bell(note(n), 0.6, 5) for n in (84, 88, 91))
    return mix(1.2, (0, rise, 0.5), (0.38, chord, 0.35), (0.38, top, 0.3))


# --- rewards and coins -------------------------------------------------------------------

def reward(base):
    # Short "bloop": fast upward pitch flick, like a droplet.
    return sweep(base, base * 2.4, 0.08, 0.4) * env(0.08, 0.001, 35)


def coin_collect():
    return mix(0.45, (0, bell(note(83), 0.12, 20), 0.6), (0.07, bell(note(88), 0.4, 7), 0.7))


def coin_scatter():
    parts = []
    for i in range(9):
        start = i * 0.035 + rng.uniform(0, 0.02)
        parts.append((start, bell(note(rng.integers(86, 98)), 0.15, 22, 1.4), rng.uniform(0.3, 0.6)))
    return mix(0.5, *parts)


def coin_fly():
    n = lowpass(noise(0.5), 2500) * env(0.5, 0.15, 5)
    tw = sum(bell(note(n), 0.2, 15) for n in (93, 96))
    return mix(0.55, (0, n, 0.8), (0.3, tw, 0.2))


# --- stingers ----------------------------------------------------------------------

def goal_complete():
    seq = [(0, 79), (0.09, 84), (0.18, 88)]
    return mix(0.8, *[(s, bell(note(n), 0.6, 5), 0.6) for s, n in seq], (0.18, pluck(note(64), 0.5, 5), 0.25))


def stage_complete():
    seq = [(0, 72), (0.12, 76), (0.24, 79), (0.36, 84)]
    parts = [(s, pluck(note(n), 0.35, 8), 0.5) for s, n in seq]
    chord = sum(pluck(note(n), 1.4, 2.2) for n in (60, 64, 67, 72, 76))
    bells = sum(bell(note(n), 1.2, 3) for n in (84, 88, 91, 96))
    roll = mix(0.5, *[(i * 0.03, lowpass(noise(0.05), 3000) * env(0.05, 0.001, 50), 0.2 + i * 0.03) for i in range(12)])
    return mix(2.0, *parts, (0.48, chord, 0.4), (0.48, bells, 0.25), (0.1, roll, 0.4))


# --- music: cute 8-bar loop, 112 bpm, C major (C – Am – F – G) -------------------------------------

def music():
    bpm = 112
    beat = 60 / bpm
    bars = 8
    length = bars * 4 * beat
    out = np.zeros(int(SR * length))

    def put(start, sig, gain):
        i = int(start * SR) % len(out)
        n = min(len(sig), len(out) - i)
        out[i:i + n] += sig[:n] * gain
        if n < len(sig):  # wrap the tail to the loop start, so the loop is seamless
            out[:len(sig) - n] += sig[n:] * gain

    chords = [(48, [60, 64, 67]), (45, [57, 60, 64]), (41, [57, 60, 65]), (43, [55, 59, 62])] * 2
    melody = [  # (beat offset in bar, midi, length in beats) per bar
        [(0, 76, 1), (1, 79, 1), (2, 84, 1.5), (3.5, 83, 0.5)],
        [(0, 81, 1), (1, 79, 1), (2, 76, 2)],
        [(0, 77, 1), (1, 81, 1), (2, 84, 1), (3, 81, 1)],
        [(0, 79, 1.5), (1.5, 77, 0.5), (2, 74, 2)],
        [(0, 76, 0.5), (0.5, 79, 0.5), (1, 84, 1), (2, 86, 1), (3, 84, 1)],
        [(0, 81, 1), (1, 84, 1), (2, 79, 2)],
        [(0, 77, 0.5), (0.5, 79, 0.5), (1, 81, 1), (2, 77, 1), (3, 74, 1)],
        [(0, 79, 2), (2, 71, 1), (3, 74, 1)],
    ]
    for bar in range(bars):
        t0 = bar * 4 * beat
        bass, chord = chords[bar]
        for b in range(4):  # bass on every beat, octave bounce
            put(t0 + b * beat, pluck(note(bass + (12 if b % 2 else 0)), beat * 0.9, 6), 0.35)
        for b in (0.5, 1.5, 2.5, 3.5):  # off-beat chord stabs
            put(t0 + b * beat, sum(pluck(note(n), beat * 0.4, 14) for n in chord), 0.12)
        for off, n, ln in melody[bar]:
            put(t0 + off * beat, pluck(note(n), ln * beat, 3.5 / ln), 0.3)
            put(t0 + off * beat, bell(note(n + 12), ln * beat, 6), 0.06)
        for b in range(4):  # soft drums: kick on 1 & 3, shaker on eighths
            if b in (0, 2):
                put(t0 + b * beat, sweep(140, 45, 0.18) * env(0.18, 0.001, 18), 0.4)
            if b in (1, 3):
                put(t0 + b * beat, lowpass(noise(0.12), 5000) * env(0.12, 0.001, 30), 0.15)
            for h in (0, 0.5):
                put(t0 + (b + h) * beat, noise(0.03) * env(0.03, 0.001, 120), 0.05)
    return out


if __name__ == '__main__':
    os.makedirs(OUT, exist_ok=True)
    save('button', button(), 0.7)
    save('popup', popup())
    save('car_add', car_add())
    save('merge', merge())
    save('gate_add', gate_add())
    save('track_upgrade', track_upgrade())
    save('reward_1', reward(520))
    save('reward_2', reward(620))
    save('coin_collect', coin_collect())
    save('coin_scatter', coin_scatter())
    save('coin_fly', coin_fly())
    save('goal_complete', goal_complete())
    save('stage_complete', stage_complete())
    save('music', music(), 0.8)
