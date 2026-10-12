Mirror reflects, repeats, or flips sections of an audio buffer across its midpoint, acting as a waveform-folding or buffer-manipulation effect.

## Try it

<md-demo
nodes='[
["Basic shapes", { Shape: "Sine" }],
["Mirror", { Mode: "Repeat", Source: "First", Mix: 100.0 }],
]'
/>

This is the real node, running. Connect an audio source to mirror and fold its waveform in real time.

## At a glance

<md-params />

## Parameters

**Mode** selects the mirroring or folding style:

| Mode        | Effect                                                         |
| ----------- | -------------------------------------------------------------- |
| Repeat      | copies the source half to repeat across the buffer             |
| Flip        | copies the source half and inverts its polarity                |
| Reflect     | mirrors the buffer symmetrically back toward the center        |
| Reflect Inv | symmetrically reflects the buffer while inverting its polarity |

**Source** chooses which half of the buffer serves as the template (`First` or `Second`).

**Mix** controls the wet/dry balance of the mirroring effect (0.0% to 100.0%).

<md-tip>
  Using **Repeat** or **Reflect** on a sine wave turns it into a rectified-looking
  wave one octave higher, while **Flip** and **Reflect Inv** leave a sine
  unchanged, because a sine is already antisymmetric around its midpoint. Try
  them on a sawtooth instead.
</md-tip>

## How it works

The Mirror node processes the audio buffer by taking either the first or second half as a source template and mapping it across the buffer according to the selected **Mode**. It optionally applies a negative sign multiplier for inverted modes, and then blends the resulting waveform with the original dry signal using the **Mix** parameter.

With **Source** set to First, the first 1024 samples stay as they are and the other half is rebuilt from them. With <md-latex>x</md-latex> as the input and <md-latex>y</md-latex> as the wet signal, for <md-latex>n \ge 1024</md-latex>:

| Mode        | Second half                                           |
| ----------- | ----------------------------------------------------- |
| Repeat      | <md-latex>y_n = x_{n - 1024}</md-latex>               |
| Flip        | <md-latex>y_n = -x_{n - 1024}</md-latex>              |
| Reflect     | <md-latex>y_n = x_{2047 - n}</md-latex>               |
| Reflect Inv | <md-latex>y_n = -x_{2047 - n}</md-latex>              |

With **Source** set to Second, the same happens the other way round: the second half is kept and the first half is rebuilt from it. The final output is <md-latex>\text{out} = x + \text{mix} \cdot (y - x)</md-latex>.

## Tutorial: folding waveforms symmetrically

1. Drop a **Basic shapes** node and a **Mirror** node onto the grid, alongside an **Output** node.
2. Connect the Basic shapes node into the input of the Mirror node.
3. Route the output to the Output node and toggle between **Mode** and **Source** options to hear how the waveform changes shape.

## Good to know

- Because one half of the frame is rebuilt from the other, the result has a fixed symmetry. Repeat makes the wave repeat twice per frame, so only even harmonics are left and the pitch jumps an octave up. Flip makes the second half the negative of the first, which leaves only odd harmonics. Reflect and Reflect Inv make the wave symmetric or antisymmetric around the midpoint of the frame.
- Where the two halves meet, the waveform can jump sharply, which adds bright overtones.

## The code

<md-lookup src="../graph/node/mirror.rs" />
