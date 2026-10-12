Phase copy takes the magnitude spectrum of the first input and maps it onto the phase spectrum of the second input, blending the spectral content and timing information of two signals.

## Try it

<md-demo
nodes='[
["Basic shapes", { Shape: "Sawtooth" }],
["Noise", { Algorithm: "Xorshift", Color: "White", Seed: 12345 }],
["Phase copy", {}],
]'
/>

This is the real node, running. Connect two sources to combine them and watch the spectral phase transfer in real time.

## At a glance

<md-params />

## Parameters

This node has no adjustable parameters; it strictly copies the phase from the secondary input onto the frequency spectrum of the primary input.

<md-tip>
  Routing a noise source into the phase input while passing a tonal sound
  through the primary input creates a smeared, disperser-like effect, scattering
  transients across time.
</md-tip>

## How it works

Phase copy takes the FFT of both inputs and, for every frequency bin <md-latex>k</md-latex>, combines the magnitude of the first input with the phase of the second. With <md-latex>A_k</md-latex> and <md-latex>B_k</md-latex> as the bins of the first and second input:

<md-latex>Y_k = \lvert A_k \rvert \cdot \frac{B_k}{\lvert B_k \rvert}</md-latex>

If a bin of the second input is silent it has no phase, so that bin is given a phase of 0 instead.

## Tutorial: cross-synthesizing phase

1. Drop a **Basic shapes** node and a **Noise** node onto the grid, then add a **Phase copy** node and an **Output** node.
2. Connect Basic shapes to the first input and Noise to the second input of the Phase copy node.
3. Connect the Phase copy output to the Output node to hear the tonal character take on the phase properties of the noise.

## Good to know

- By borrowing the timing information from one sound and applying it to the volume levels of another, this node lets you morph the texture of two completely different signals together.

## The code

<md-lookup src="../graph/node/phase_copy.rs" />
