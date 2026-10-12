Spectral Blur diffuses the energy of adjacent frequency bins across the spectrum, acting as an FFT-based spectral smearing or frequency-smoothing effect.

## Try it

<md-demo
nodes='[
["Basic shapes", { Shape: "Square" }],
["Spectral Blur", { Mode: "Magnitude", Width: 4.0, Mix: 100.0 }],
["Output"],
]'
/>

This is the real node, running. Connect an audio source to smooth and smear its frequency spectrum in real time.

## At a glance

<md-params />

## Parameters

**Mode** selects the blurring method applied to the frequency spectrum:

| Mode      | Effect                                                                  |
| --------- | ----------------------------------------------------------------------- |
| Magnitude | smooths only the spectral magnitudes while preserving phase information |
| Complex   | averages both real and imaginary components across adjacent bins        |

**Width** sets the blur radius in harmonic units (0.0 to 1024.0).

**Mix** controls the wet/dry balance of the spectral blur effect (0.0% to 100.0%).

<md-tip>
  Using **Magnitude** mode with a wide blur radius on complex chords turns
  harmonic textures into smooth, pad-like washes of sound.
</md-tip>

## How it works

Spectral Blur converts the input signal into the frequency domain via Fast Fourier Transform (FFT). It applies a weighted triangular window across neighboring frequency bins based on the **Width** parameter. In **Magnitude** mode, it averages the bin magnitudes while retaining the original phase components, preventing destructive phase cancellation. In **Complex** mode, it averages the real and imaginary parts directly. Finally, the processed spectrum is converted back into the time domain via inverse FFT and blended with the dry signal using the **Mix** parameter.

## Tutorial: smearing harmonic content

1. Drop a **Basic shapes** node (set to Square) and a **Spectral Blur** node onto the grid, alongside an **Output** node.
2. Connect the Basic shapes node into the input of the Spectral Blur node.
3. Route the output to the Output node and adjust the **Width** and **Mode** parameters to hear the harmonic spectrum blur out.

## Good to know

- Because spectral blur diffuses sharp spectral peaks across neighboring bins, it effectively softens harsh timbres and creates ambient, reverb-like smearing without adding artificial room reflections.
