Spectral Morph blends two audio signals together in the frequency domain, allowing you to crossfade their harmonic content and structural shapes smoothly.

## Try it

<md-demo
nodes='[
["Basic shapes", { Shape: "Sawtooth" }],
["Noise", { Algorithm: "Xorshift", Color: "White", Seed: 12345 }],
["Spectral Morph", { Morph: 50.0, Blend: "Linear", Phase: "A" }],
]'
/>

This is the real node, running. Connect two sources to morph between them and watch the frequency spectrum transition in real time.

## At a glance

<md-params />

## Parameters

**Morph** controls the blend amount between the two inputs (0.0% to 100.0%).

**Blend** chooses the mathematical interpolation curve:

| Blend     | Effect                                                                                              |
| --------- | --------------------------------------------------------------------------------------------------- |
| Linear    | straight crossfade of harmonic amplitudes                                                           |
| Geometric | crossfade in the logarithmic (dB) domain, so a harmonic must be present in both inputs to stay loud |

**Phase** selects which input supplies the phase and timing information:

| Phase | Effect                                                |
| ----- | ----------------------------------------------------- |
| A     | keeps the phase characteristics of the first input    |
| B     | borrows the phase characteristics of the second input |

<md-tip>
  Linear blend keeps the harmonics of both inputs, while Geometric blend only
  keeps the harmonics that both inputs share, which makes the in-between sounds
  hollower and quieter. Use Linear for a full, even morph and Geometric for a
  more selective one.
</md-tip>

## How it works

Spectral Morph converts both incoming audio buffers into the frequency domain using a Fast Fourier Transform (FFT). For every individual frequency bin, it calculates the magnitude of both signals and crossfades them according to the **Morph** parameter and the chosen **Blend** mode. With <md-latex>t</md-latex> as Morph (as a fraction, so 50% is <md-latex>t = 0.5</md-latex>) and <md-latex>m_A</md-latex>, <md-latex>m_B</md-latex> as the two magnitudes:

| Blend     | New magnitude                                                            |
| --------- | ------------------------------------------------------------------------ |
| Linear    | <md-latex>m = m_A + t \cdot (m_B - m_A)</md-latex>                       |
| Geometric | <md-latex>m = m_A^{\thinspace 1 - t} \cdot m_B^{\thinspace t}</md-latex> |

Once the target magnitude is determined, it pairs that new amplitude with the phase information selected by the **Phase** parameter (either input A or input B). Finally, it transforms the combined frequency data back into the time domain using an inverse FFT, creating a smooth acoustic transition that traditional time-domain crossfading cannot achieve.

## Tutorial: morphing two waveforms

1. Drop a **Basic shapes** node and a **Noise** node onto the grid, then add a **Spectral Morph** node and an **Output** node.
2. Connect Basic shapes to the first input and Noise to the second input of the Spectral Morph node.
3. Sweep the **Morph** knob from 0% to 100% to hear the tonal signal gradually dissolve into noise.

## Good to know

- Because this node operates bin by bin in the frequency spectrum, it can blend the harmonic profiles of two completely different sounds without phase cancellation artifacts.

## The code

<md-lookup src="../graph/node/morph.rs" />
