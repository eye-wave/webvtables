Ring Modulation multiplies two audio signals together, producing metallic, bell-like, and inharmonic sidebands characteristic of frequency multiplication.

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

## Tutorial: combining two signals

1. Drop a **Basic shapes** node and a **Noise** node onto the grid, then add a **Ring Modulation** node and an **Output** node.
2. Connect both source nodes into the two inputs of the Ring Modulation node, and connect its output to the Output node.
3. Listen to how the frequency contents of both input signals interact and create complex sidebands.

## Good to know

- Because ring modulation multiplies the signals in the time domain, the output contains the sum and difference frequencies of the inputs with the original carrier frequencies suppressed.
