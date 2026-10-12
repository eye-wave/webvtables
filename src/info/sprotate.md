Spectral Rotate shifts or reverses frequency bins across the spectrum, acting as an FFT-based spectral rotator or frequency shifter.

## Try it

<md-demo
nodes='[
["Basic shapes", { Shape: "Sawtooth" }],
["Spectral Rotate", { Mode: "Rotate", Amount: 16, Mix: 100.0 }],
]'
/>

This is the real node, running. Connect an audio source to rotate or reverse its frequency spectrum in real time.

## At a glance

<md-params />

## Parameters

**Mode** selects the spectral manipulation type:

| Mode    | Effect                                               |
| ------- | ---------------------------------------------------- |
| Rotate  | shifts frequency bins upward by the specified amount, with the bins that fall off the top wrapping around to the bottom |
| Reverse | mirrors the spectrum before shifting frequency bins  |

**Amount** sets the number of bins to shift the spectrum by (0 to 1023). The rotation covers 1023 bins (harmonics 1 to 1023), so an Amount of 1023 is the same as 0.

**Mix** controls the wet/dry balance of the spectral rotation effect (0.0% to 100.0%).

<md-tip>
  Shifting frequency bins by small amounts can introduce metallic,
  comb-filtering, or ring-modulation timbres to simple waveforms.
</md-tip>

## How it works

The Spectral Rotate node transforms the input signal into the frequency domain using a Fast Fourier Transform (FFT). It takes the frequency spectrum and shifts the bins by the offset defined by the **Amount** parameter, optionally reversing the spectral order first if **Mode** is set to Reverse. The lowest bin, which holds DC, is left alone. With <md-latex>A</md-latex> as **Amount** and <md-latex>X_k</md-latex> as the input spectrum, the Rotate mode moves every bin like this (counting the 1023 bins from 0 to 1022):

<md-latex>Y_i = X_{(i - A) \bmod 1023}</md-latex>

In Reverse mode the bin order is flipped first, so <md-latex>i</md-latex> is replaced by <md-latex>1022 - i</md-latex> in the formula above. Finally, it blends the processed spectrum with the original dry signal using the **Mix** parameter before converting it back into the time domain via inverse FFT.

## Tutorial: rotating frequency bins

1. Drop a **Basic shapes** node and a **Spectral Rotate** node onto the grid, alongside an **Output** node.
2. Connect the Basic shapes node into the input of the Spectral Rotate node.
3. Route the output to the Output node and adjust the **Mode** and **Amount** parameters to hear the harmonic shift.

## Good to know

- Unlike pitch shifting which scales frequencies proportionally, rotating frequency bins shifts harmonic partials by a constant offset, turning harmonic series into inharmonic metallic bells.

## The code

<md-lookup src="../graph/node/rotate.rs" />
