Harmonics stacks higher-pitched copies of the input on top of the original, one copy for each multiplier 2, 2 + Gap, 2 + 2 × Gap and so on, each quieter than the one before it. It is a quick way to add upper harmonics to any waveform. See **Octave** for the same idea with octave spacing only.

## Try it

<md-demo
nodes='[
["Basic shapes", { Shape: "Sine" }],
["Harmonics", { Harmonics: 6, Gap: 1, Slope: 0.4 }],
]'
/>

## At a glance

<md-params />

## Parameters

**Harmonics** (1 to 64) sets how many copies are added on top of the original.

**Gap** (1 to 16) sets the step between the multipliers of neighboring copies. The first copy is always at 2 times the pitch:

| Gap | Multipliers of the copies |
| --- | ------------------------- |
| 1   | 2, 3, 4, 5, 6 and so on   |
| 2   | 2, 4, 6, 8, 10 and so on  |
| 3   | 2, 5, 8, 11, 14 and so on |

**Slope** (0.0 to 1.0) sets how much quieter every copy is than the one before it. Each copy is <md-latex>1 - \text{Slope}</md-latex> times as loud as the previous one. At 0 all copies are equally loud, at 0.5 each is half as loud as the last (-6 dB), and at 1 only the first copy remains.

<md-tip>
  Gap 2 gives the multipliers 2, 4, 6, 8, which keeps the added harmonics in a
  tidy even series. Gap 1 fills in every multiple and gives the densest, most
  buzzy result.
</md-tip>

## How it works

A copy at multiplier <md-latex>m</md-latex> is the input frame read at <md-latex>m</md-latex> times the speed, so it repeats <md-latex>m</md-latex> times per frame. With <md-latex>x_i</md-latex> as the input, <md-latex>H</md-latex> as **Harmonics**, <md-latex>G</md-latex> as **Gap** and <md-latex>S</md-latex> as **Slope**:

<md-latex>y_i = x_i + \sum_{j=0}^{H-1} (1 - S)^j \thinspace x_{(i \cdot m_j) \bmod 2048}, \qquad m_j = 2 + j \thinspace G</md-latex>

The original always keeps its full level, and the first copy (<md-latex>j = 0</md-latex>) is added at the same full level. Every harmonic of the input at number <md-latex>k</md-latex> shows up again at <md-latex>k \cdot m_j</md-latex>. If the sum would go above <md-latex>\pm 1</md-latex>, the whole frame is divided by its peak. A sum that stays within <md-latex>\pm 1</md-latex> is left alone, so this node never makes the signal louder.

## Tutorial: stacking harmonics on a sine

1. Drop a **Basic shapes** node set to Sine, then add a **Harmonics** node and an **Output** node.
2. Connect Basic shapes to Harmonics, and Harmonics to the Output node.
3. Raise **Harmonics** and watch new spectrum lines appear above the fundamental.
4. Set **Gap** to 2 so that only the even multiples remain.
5. Raise **Slope** to let the upper copies fade out faster.

## Good to know

- Adding copies can make the original quieter. When the sum goes over full scale, the whole frame is scaled down, original included.
- The copies are read straight from the frame without any smoothing. A harmonic that lands above 1024 folds back down as aliasing, so large multipliers on rich inputs such as a sawtooth get noisy quickly. Sines and other simple waves work best, and a node like **FFT Filter** can tidy up afterwards.
- The highest possible multiplier is <md-latex>2 + 63 \cdot 16 = 1010</md-latex>.
- Gap works differently than in **Partials**. Here it is the step between multipliers, so a Gap of 1 skips nothing, while in Partials a Gap of 0 skips nothing.
- **Harmonic shift** moves the harmonics of the input. Harmonics keeps the original and adds copies of it on top.

## The code

<md-lookup src="../graph/node/harmonics.rs" />
