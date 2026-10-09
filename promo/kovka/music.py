"""Original 30 s soundtrack for the KOVKA film: 120 BPM, C major (C–G–Am–F), with sound effects on the cuts.

Everything is synthesised here (no samples), so the track is ours to use anywhere.
    python3 music.py out.wav
Scene times mirror `T` in template.html: logo 0, how 4.5, uniq 12.5, use 19, end 25, dur 30.
"""
import sys
import wave
import numpy as np

SR, DUR, BPM = 44100, 30.0, 120
BEAT = 60 / BPM
N = int(SR * DUR)
L = np.zeros(N)
R = np.zeros(N)
rng = np.random.default_rng(7)


def note_hz(name):
    names = {'C': 0, 'C#': 1, 'D': 2, 'D#': 3, 'E': 4, 'F': 5, 'F#': 6, 'G': 7, 'G#': 8, 'A': 9, 'A#': 10, 'B': 11}
    n, o = name[:-1], int(name[-1])
    return 440.0 * 2 ** ((names[n] + 12 * (o + 1) - 69) / 12)


def add(t0, sig, gain=1.0, pan=0.0):
    i = int(t0 * SR)
    if i >= N or i + len(sig) <= 0:
        return
    if i < 0:
        sig, i = sig[-i:], 0
    sig = sig[: N - i] * gain
    L[i:i + len(sig)] += sig * np.sqrt(0.5 * (1 - pan))
    R[i:i + len(sig)] += sig * np.sqrt(0.5 * (1 + pan))


def env(n, a=0.005, d=0.3):
    t = np.arange(n) / SR
    return np.minimum(t / a, 1) * np.exp(-t / d)


def lowpass(x, k):
    # one-pole low-pass; k in (0, 1], smaller = darker
    y = np.empty_like(x)
    acc = 0.0
    for i, v in enumerate(x):
        acc += k * (v - acc)
        y[i] = acc
    return y


# ---------- instruments ----------
def marimba(hz, length=0.6, bright=1.0):
    n = int(length * SR)
    t = np.arange(n) / SR
    s = np.sin(2 * np.pi * hz * t) * np.exp(-t / 0.35)
    s += 0.35 * bright * np.sin(2 * np.pi * hz * 4.0 * t) * np.exp(-t / 0.06)
    s += 0.12 * np.sin(2 * np.pi * hz * 10.0 * t) * np.exp(-t / 0.02)
    return s * np.minimum(t / 0.002, 1)


def pluck(hz, length=0.9):
    # Karplus–Strong
    n, p = int(length * SR), max(2, int(SR / hz))
    buf = rng.uniform(-1, 1, p)
    out = np.empty(n)
    for i in range(n):
        out[i] = buf[i % p]
        buf[i % p] = 0.996 * 0.5 * (buf[i % p] + buf[(i + 1) % p])
    return out * 0.6


def pad(hzs, length):
    n = int(length * SR)
    t = np.arange(n) / SR
    s = sum(np.sin(2 * np.pi * h * t + d) + np.sin(2 * np.pi * h * 1.004 * t) for h in hzs for d in [0])
    e = np.minimum(t / 0.4, 1) * np.minimum((length - t) / 0.4, 1)
    return s * e / (2 * len(hzs))


def bass(hz, length=0.24):
    n = int(length * SR)
    t = np.arange(n) / SR
    s = np.sin(2 * np.pi * hz * t) + 0.25 * np.sin(2 * np.pi * hz * 2 * t)
    return s * np.minimum(t / 0.004, 1) * np.exp(-t / 0.18)


def kick(gain=1.0):
    n = int(0.35 * SR)
    t = np.arange(n) / SR
    f = 45 + 95 * np.exp(-t / 0.04)
    return np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-t / 0.16) * gain


def clap():
    n = int(0.22 * SR)
    t = np.arange(n) / SR
    noise = rng.uniform(-1, 1, n)
    hp = noise - lowpass(noise, 0.25)
    e = sum(np.exp(-np.maximum(t - d, 0) / 0.012) * (t >= d) for d in (0, 0.01, 0.022)) * 0.4 + np.exp(-t / 0.08) * 0.6
    return hp * e


def hat(open_=False):
    n = int((0.18 if open_ else 0.05) * SR)
    t = np.arange(n) / SR
    noise = rng.uniform(-1, 1, n)
    return (noise - lowpass(noise, 0.6)) * np.exp(-t / (0.07 if open_ else 0.015))


def whoosh(length=0.5, up=True):
    n = int(length * SR)
    t = np.arange(n) / SR
    noise = rng.uniform(-1, 1, n)
    k = np.linspace(0.02, 0.35, n) if up else np.linspace(0.35, 0.02, n)
    y = np.empty(n)
    acc = 0.0
    for i in range(n):
        acc += k[i] * (noise[i] - acc)
        y[i] = acc
    e = np.sin(np.pi * t / length) ** 2
    return y * e * 2.2


def pop(hz=600, length=0.09):
    n = int(length * SR)
    t = np.arange(n) / SR
    f = hz * (1 + 1.5 * np.exp(-t / 0.01))
    return np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-t / 0.03)


def thump():
    k = kick(0.9)[: int(0.25 * SR)].copy()
    p = pop(320, 0.12)
    k[: len(p)] += 0.4 * p
    return k


def chime(hzs, length=2.2):
    n = int(length * SR)
    t = np.arange(n) / SR
    s = sum(np.sin(2 * np.pi * h * t) * np.exp(-t / 0.9) + 0.3 * np.sin(2 * np.pi * h * 2.76 * t) * np.exp(-t / 0.3) for h in hzs)
    return s / len(hzs)


def bubbles(t0, t1, gain=0.25):
    t = t0
    while t < t1:
        add(t, pop(rng.uniform(700, 1600), 0.05), gain, rng.uniform(-0.5, 0.5))
        t += rng.uniform(0.04, 0.12)


# ---------- music ----------
CHORDS = [  # (bass, pad notes, melody 8ths)
    ('C2', ['C4', 'E4', 'G4'], ['E5', None, 'G5', None, 'A5', 'G5', 'E5', None]),
    ('G1', ['B3', 'D4', 'G4'], ['D5', None, 'G5', None, 'B4', None, 'D5', None]),
    ('A1', ['C4', 'E4', 'A4'], ['C5', None, 'E5', None, 'A5', 'G5', 'E5', None]),
    ('F1', ['C4', 'F4', 'A4'], ['F5', 'E5', 'C5', None, 'A4', None, 'C5', None]),
]
bars = int(DUR / (4 * BEAT))
for b in range(bars):
    t0 = b * 4 * BEAT
    bn, pn, mel = CHORDS[b % 4]
    sec = 'logo' if t0 < 4.5 else 'how' if t0 < 12.5 else 'uniq' if t0 < 19 else 'use' if t0 < 25 else 'end'
    add(t0, pad([note_hz(x) for x in pn], 4 * BEAT), 0.16)
    # lead: marimba, plucked in the story parts
    for k, m in enumerate(mel):
        if m is None:
            continue
        inst = pluck if sec == 'how' else marimba
        add(t0 + k * BEAT / 2, inst(note_hz(m)), 0.22 if inst is marimba else 0.3, pan=0.25 * ((k % 2) * 2 - 1))
    # bass + drums
    if sec != 'logo' or t0 >= 2.0:
        for k in range(8):
            if sec in ('uniq', 'use') or k % 2 == 0:
                add(t0 + k * BEAT / 2, bass(note_hz(bn) * (2 if k % 4 == 3 else 1)), 0.35)
    for beat in range(4):
        tb = t0 + beat * BEAT
        if sec == 'logo' and tb < 4.0:
            continue
        if sec in ('uniq', 'use') or beat in (0, 2):
            add(tb, kick(), 0.55)
        if beat in (1, 3) and sec != 'end':
            add(tb, clap(), 0.2, 0.1)
        for h in range(2):
            add(tb + h * BEAT / 2, hat(open_=(h == 1 and sec in ('uniq', 'use'))), 0.07 if h else 0.05, -0.3)

# ---------- sound design on the cuts ----------
# logo: NARIN letters slam, the rest falls, the A slides, KOVK slam in
for i in range(5):
    add(0.1 + i * 0.12, thump(), 0.45)
add(0.8, chime([note_hz('C5'), note_hz('E5'), note_hz('G5')], 1.4), 0.12)
add(1.95, whoosh(0.5, False), 0.35)
add(2.15, whoosh(0.8, True), 0.3, 0.4)
for i in range(4):
    add(2.55 + i * 0.1, thump(), 0.5)
add(3.2, chime([note_hz('C5'), note_hz('G5'), note_hz('E6')], 2.0), 0.22)
for i in range(6):
    add(3.35 + i * 0.05, pop(900 + i * 120), 0.18, (i % 2) * 0.6 - 0.3)
# how: can slides in, water, flowers drop in, reveal
add(4.45, whoosh(0.45, True), 0.3)
add(4.5 + 1.9, whoosh(0.4, False), 0.15)
bubbles(4.5 + 2.1, 4.5 + 3.5)
for i in range(11):
    add(4.5 + 3.95 + i * 0.18 + 0.12, pluck(note_hz(['C5', 'E5', 'G5', 'A5', 'C6', 'D6', 'E6', 'G5', 'A5', 'C6', 'E6'][i]), 0.6), 0.25, (i % 3 - 1) * 0.5)
add(4.5 + 5.6, whoosh(0.45, True), 0.35)
add(4.5 + 6.05, chime([note_hz('C5'), note_hz('E5'), note_hz('G5'), note_hz('C6')], 2.4), 0.35)
# uniqueness: headline slams, flipbook ticks speeding up
add(12.5, thump(), 0.5)
acc = 12.5 + 1.4
for d in [0.5, 0.45, 0.4, 0.35, 0.3, 0.28, 0.25, 0.22, 0.22, 0.22, 0.22, 0.22]:
    add(acc, pop(1200, 0.05), 0.3, rng.uniform(-0.4, 0.4))
    acc += d
add(12.5 + 5.2, thump(), 0.5)
add(12.5 + 5.2, chime([note_hz('A4'), note_hz('C5'), note_hz('E5')], 1.6), 0.2)
# occasions: a hit on every card
add(19.0, thump(), 0.5)
for i in range(6):
    add(19 + 1.2 + i * 0.7, thump(), 0.4)
    add(19 + 1.2 + i * 0.7, pop(700 + i * 80, 0.08), 0.2)
# end card
add(24.85, whoosh(0.3, True), 0.3)
add(25.0, chime([note_hz('C5'), note_hz('E5'), note_hz('G5'), note_hz('C6')], 3.0), 0.4)
add(26.1, pop(1000), 0.25)

# ---------- master ----------
mix = np.stack([L, R], 1)
fade = int(0.6 * SR)
mix[-fade:] *= np.linspace(1, 0, fade)[:, None]
mix = np.tanh(mix * 1.4) / np.tanh(1.4)
mix *= 0.89 / np.max(np.abs(mix))
pcm = (mix * 32767).astype(np.int16)
with wave.open(sys.argv[1], 'wb') as w:
    w.setnchannels(2); w.setsampwidth(2); w.setframerate(SR)
    w.writeframes(pcm.tobytes())
print(sys.argv[1], DUR, 's')
