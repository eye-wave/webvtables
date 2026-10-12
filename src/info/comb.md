Comb filters audio signals by blending delayed copies iteratively, creating resonant peaks, metallic comb-filtering, or physical modeling feedback effects. Read more on the [Comb filter](https://en.wikipedia.org/wiki/Comb_filter) via Wikipedia.

## Try it

> hidden node in this demo is a sawtooth wave.

<md-demo
nodes='[
["Basic shapes", { Shape: "Sawtooth" }, true],
["Comb", { Delay: 55, Iter: 15 }],
["Output"]
]'
/>

This is the real node, running. Connect an audio source to shape its frequency spectrum with recursive feedback delays.

## At a glance

<md-params />

## Parameters

**Delay** sets the feedback or delay interval in samples (0 to 2048).

**Iter** sets the iteration count for recursive feedback loops (1 to 35).

<md-tip>
  Using shorter delay times creates sharp, resonant phase combs that instantly
  transform simple waveforms into metallic, hollow timbres.
</md-tip>

## How it works

The Comb node processes the input buffer iteratively by combining each sample with a delayed counterpart according to the **Delay** and **Iter** parameters, building up resonant harmonic peaks across the frequency spectrum.

Clicking the **rem DC** button on the node interface can be especially useful here to eliminate direct current (DC) offsets and low-frequency energy build-up that can accumulate during recursive feedback processing.

## Tutorial: creating resonant comb filters

1. Drop a **Basic shapes** node and a **Comb** node onto the grid, alongside an **Output** node.
2. Connect the Basic shapes node into the input of the Comb node.
3. Route the output to the Output node and adjust the **Delay** and **Iter** parameters to sculpt the resonant overtone structure.

## Good to know

- Because comb filtering creates evenly spaced notches and peaks across the frequency spectrum, it forms the foundational building block for effects like flangers, choruses, and physical modeling synthesis.
