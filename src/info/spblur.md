Spectral Blur diffuses the energy of adjacent frequency bins across the spectrum, acting as an FFT-based spectral smearing or frequency-smoothing effect.

## Try it

> hidden node in this demo is a square wave.

<md-demo
nodes='[
["Basic shapes", { Shape: "Square" },true],
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

Spectral Blur converts the input signal into the frequency domain via Fast Fourier Transform (FFT). It applies a weighted triangular window across neighboring frequency bins based on the **Width** parameter. With <md-latex>r</md-latex> as the Width (rounded down to a whole number of bins), the bin <md-latex>j</md-latex> at distance <md-latex>|j - k|</md-latex> from the bin being smoothed gets the weight <md-latex>w_j = 1 - \frac{|j-k|}{r+1}</md-latex>, and the result is the weighted average <md-latex>\bar{X}_k = \frac{\sum_j w_j X_j}{\sum_j w_j}</md-latex> over <md-latex>k - r \le j \le k + r</md-latex>. In **Magnitude** mode, it averages the bin magnitudes while retaining the original phase components, preventing destructive phase cancellation. In **Complex** mode, it averages the real and imaginary parts directly. Finally, the processed spectrum is converted back into the time domain via inverse FFT and blended with the dry signal using the **Mix** parameter: <md-latex>X'_k = X_k + \text{mix} \cdot (\bar{X}_k - X_k)</md-latex>. The lowest bin (which holds DC) is left untouched.

## Tutorial: smearing harmonic content

1. Drop a **Basic shapes** node (set to Square) and a **Spectral Blur** node onto the grid, alongside an **Output** node.
2. Connect the Basic shapes node into the input of the Spectral Blur node.
3. Route the output to the Output node and adjust the **Width** and **Mode** parameters to hear the harmonic spectrum blur out.

## Good to know

- Because spectral blur diffuses sharp spectral peaks across neighboring bins, it effectively softens harsh timbres and creates ambient, reverb-like smearing without adding artificial room reflections.

## The code

<md-lookup src="../graph/node/blur.rs" />
