Ring Modulation multiplies two audio signals together, producing metallic, bell-like, and inharmonic sidebands at the sum and difference of the input frequencies.

## Try it

<md-demo
nodes='[
["Basic shapes", { Shape: "Sine" }],
["Noise", { Algorithm: "Xorshift", Color: "White", Seed: 12345 }],
["Ring Modulation", {}],
]'
/>

## At a glance

<md-params />

## Parameters

This node has no adjustable parameters; it strictly multiplies the two input buffers sample by sample.

<md-tip>
  Multiplying a clean sine wave with a noise source creates clangorous, ringing
  percussive textures and robotic voices.
</md-tip>

## How it works

Every sample of the first input is multiplied by the matching sample of the second input: <md-latex>y_n = a_n \cdot b_n</md-latex>. For two sine waves on harmonics <md-latex>j</md-latex> and <md-latex>k</md-latex> this gives

<md-latex>\sin(2\pi j t) \cdot \sin(2\pi k t) = \tfrac{1}{2}\left[\cos\big(2\pi (j - k) t\big) - \cos\big(2\pi (j + k) t\big)\right]</md-latex>

so the output holds the difference harmonic <md-latex>\lvert j - k \rvert</md-latex> and the sum harmonic <md-latex>j + k</md-latex>, but neither of the originals.

## Tutorial: combining two signals

1. Drop a **Basic shapes** node and a **Noise** node onto the grid, then add a **Ring Modulation** node and an **Output** node.
2. Connect both source nodes into the two inputs of the Ring Modulation node, and connect its output to the Output node.
3. Listen to how the frequency contents of both input signals interact and create complex sidebands.

## Good to know

- Because ring modulation multiplies the signals in the time domain, the output contains the sum and difference frequencies of the inputs with the original carrier frequencies suppressed.

## The code

<md-lookup src="../graph/node/ring_mod.rs" />
