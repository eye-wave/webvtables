Octave stacks copies of the input that sound one, two, three or more octaves higher on top of the original, each quieter than the one before it. It thickens a waveform with upper octaves, much like an organ or an octaver pedal.

## Try it

<md-demo
nodes='[
["Basic shapes", { Shape: "Sine" }],
["Octave", { Octaves: 3, Slope: 0.4 }],
]'
/>

## At a glance

<md-params />

## Parameters

**Octaves** (1 to 8) sets how many octave copies are added on top of the original. Copy number <md-latex>j</md-latex> sounds <md-latex>j</md-latex> octaves higher, so it repeats <md-latex>2^j</md-latex> times per frame:

| Octaves | Copies that are added                      |
| ------- | ------------------------------------------ |
| 1       | one octave up (2 times the pitch)          |
| 2       | one and two octaves up (2 and 4 times)     |
| 3       | up to three octaves up (2, 4 and 8 times)  |
| 8       | up to eight octaves up (2 up to 256 times) |

**Slope** (0.0 to 1.0) sets how much quieter every copy is than the one before it. Each octave is <md-latex>1 - \text{Slope}</md-latex> times as loud as the one below it, counting from the original. At 0 all copies are as loud as the original, at 0.5 the copies get -6 dB for each octave up, and at 1 no copy is audible, so the signal passes through unchanged.

<md-tip>
  A Slope around 0.5 gives a natural, organ-like stack. A Slope near 0 makes
  all octaves equally loud, which sounds thin and shimmering.
</md-tip>

## How it works

With <md-latex>x_i</md-latex> as the input, <md-latex>O</md-latex> as **Octaves** and <md-latex>S</md-latex> as **Slope**, the node adds the input frame read at double speed, quadruple speed and so on:

<md-latex>y_i = x_i + \sum_{j=1}^{O} (1 - S)^j \thinspace x_{(i \cdot 2^j) \bmod 2048}</md-latex>

Every harmonic of the input at number <md-latex>k</md-latex> shows up again at <md-latex>2k, 4k, 8k</md-latex> and so on. If the sum would go above <md-latex>\pm 1</md-latex>, the whole frame is divided by its peak. A sum that stays within <md-latex>\pm 1</md-latex> is left alone, so this node never makes the signal louder.

## Tutorial: adding octaves to a sine

1. Drop a **Basic shapes** node set to Sine, then add an **Octave** node and an **Output** node.
2. Connect Basic shapes to Octave, and Octave to the Output node.
3. Raise **Octaves** and watch new spectrum lines appear at 2, 4 and 8 times the fundamental.
4. Raise **Slope** to fade the higher octaves out.

## Good to know

- Octave is the special case of **Harmonics** in which the copies are spaced by octaves (2, 4, 8) instead of by a fixed step. A difference: here the first copy is already scaled by <md-latex>1 - \text{Slope}</md-latex>, while in Harmonics the first copy is added at full level.
- Adding copies can make the original quieter. When the sum goes over full scale, the whole frame is scaled down, original included.
- The copies are read straight from the frame without any smoothing. A harmonic that lands above 1024 folds back down as aliasing, so high Octaves on rich inputs such as a sawtooth get noisy quickly. Sines and other simple waves work best.

## The code

<md-lookup src="../graph/node/octave.rs" />
