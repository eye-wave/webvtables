Intersect combines the frequency spectra of two audio signals using geometric mean, minimum, or multiplication, acting as a spectral cross-synthesis or filtering effect.

## Try it

<md-demo
nodes='[
["Basic shapes", { Shape: "Sawtooth" }],
["Noise", { Algorithm: "Xorshift", Color: "White", Seed: 12345 }],
["Intersect", { Mode: "Geometric", Phase: "A" }],
]'
/>

## At a glance

<md-params />

## Parameters

**Mode** selects the mathematical operation used to combine the frequency magnitudes of the two inputs:

| Mode      | Effect                                                                                              |
| --------- | --------------------------------------------------------------------------------------------------- |
| Geometric | calculates the geometric mean of both input magnitudes (<md-latex>\sqrt{m_a \times m_b}</md-latex>) |
| Min       | retains the lowest magnitude between the two inputs (<md-latex>\min(m_a, m_b)</md-latex>)           |
| Multiply  | multiplies both magnitude spectra together (<md-latex>m_a \times m_b</md-latex>)                    |

**Phase** chooses which input's phase spectrum is preserved for the output (`A` or `B`).

<md-tip>
  Using **Multiply** mode will heavily attenuate signals unless both inputs
  share overlapping harmonic content, creating a sharp gating or filtering
  effect.
</md-tip>

## How it works

The Intersect node transforms both incoming audio signals into the frequency domain using Fast Fourier Transforms (FFTs). It computes the magnitudes for each bin and combines them according to the selected **Mode**. It then applies the phase information from either input **A** or input **B** depending on the **Phase** parameter, before reconstructing the final signal back into the time domain via inverse FFT. With <md-latex>m</md-latex> as the combined magnitude and <md-latex>\varphi</md-latex> as the phase of the chosen input, each bin becomes <md-latex>Y_k = m_k \cdot e^{j\varphi_k}</md-latex>. A bin that is silent in the input that supplies the phase stays silent.

## Tutorial: cross-synthesizing two audio streams

1. Drop two distinct audio source nodes and an **Intersect** node onto the grid, alongside an **Output** node.
2. Connect the first source to input `0` and the second source to input `1` of the Intersect node.
3. Route the output to the Output node and toggle between **Mode** and **Phase** options to hear how the two sounds blend together spectrally.

## Good to know

- By combining the magnitude spectrum of one sound with the phase spectrum of another you can achieve vocoder-style cross-synthesis results.

## The code

<md-lookup src="../graph/node/intersect.rs" />
