Even/Odd Split separates the harmonic spectrum of an audio signal into even and independent odd frequency components, allowing you to process or route harmonic layers separately.

## Try it

<md-demo
nodes='[
["Basic shapes", { Shape: "Sawtooth" }],
["Even/Odd Split", { Bleed: 0.0 }],
]'
/>

## At a glance

<md-params />

## Parameters

**Bleed** controls the cross-feed amount between the even and odd frequency outputs (0.0% to 100.0%).

<md-tip>
  Increasing the **Bleed** parameter slightly softens the extreme harmonic
  separation, blending elements of the opposite frequency components back into
  each output channel.
</md-tip>

## How it works

Even/Odd Split converts the incoming audio signal into the frequency domain using a Fast Fourier Transform (FFT). It iterates through each frequency bin, sorting even-numbered bins into the first spectrum and odd-numbered bins into the second spectrum while factoring in the **Bleed** parameter. Finally, it transforms both spectra back into the time domain via inverse FFT, providing two distinct outputs-one dominated by even harmonics and the other by odd harmonics.

The node's built-in display visually shows only the even waveform, as it specifically renders the first output channel.

## Tutorial: splitting harmonic layers

1. Drop a **Basic shapes** node (set to Sawtooth) and an **Even/Odd Split** node onto the grid, along with two **Output** nodes.
2. Connect the Basic shapes node to the input of the Even/Odd Split node.
3. Route the first output of the Even/Odd Split to one Output node and the second output to another to hear the distinct harmonic character of each split path.

## Good to know

- Because a sawtooth wave contains both even and odd harmonics, splitting them apart creates distinct timbral textures that can be heavily processed independently before being recombined.
