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

| Blend     | Effect                                              |
| --------- | --------------------------------------------------- |
| Linear    | straight crossfade of harmonic amplitudes           |
| Geometric | logarithmic scaling for smoother energy transitions |

**Phase** selects which input supplies the phase and timing information:

| Phase | Effect                                                |
| ----- | ----------------------------------------------------- |
| A     | keeps the phase characteristics of the first input    |
| B     | borrows the phase characteristics of the second input |

<md-tip>
  Using Geometric blend when morphing between harmonic sources prevents the
  intermediate sounds from sounding hollow or losing volume.
</md-tip>

## How it works

Spectral Morph converts both incoming audio buffers into the frequency domain using a Fast Fourier Transform (FFT). For every individual frequency bin, it calculates the magnitude of both signals and crossfades them according to the **Morph** parameter and the chosen **Blend** mode.

Once the target magnitude is determined, it pairs that new amplitude with the phase information selected by the **Phase** parameter (either input A or input B). Finally, it transforms the combined frequency data back into the time domain using an inverse FFT, creating a smooth acoustic transition that traditional time-domain crossfading cannot achieve.

## Tutorial: morphing two waveforms

1. Drop a **Basic shapes** node and a **Noise** node onto the grid, then add a **Spectral Morph** node and an **Output** node.
2. Connect Basic shapes to the first input and Noise to the second input of the Spectral Morph node.
3. Sweep the **Morph** knob from 0% to 100% to hear the tonal signal gradually dissolve into noise.

## Good to know

- Because this node operates bin by bin in the frequency spectrum, it can blend the harmonic profiles of two completely different sounds without phase cancellation artifacts.
