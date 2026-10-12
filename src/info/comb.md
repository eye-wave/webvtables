Comb filters audio signals by repeatedly averaging the signal with a shifted copy of itself, creating evenly spaced resonant peaks and notches, a metallic, hollow timbre. Read more on the [Comb filter](https://en.wikipedia.org/wiki/Comb_filter) via Wikipedia.

## Try it

> hidden node in this demo is a sawtooth wave.

<md-demo
nodes='[
["Basic shapes", { Shape: "Sawtooth" }, true],
["Comb", { Delay: 55, Iter: 15 }],
["Output"]
]'
/>

This is the real node, running. Connect an audio source to shape its frequency spectrum with repeated shift-and-average passes.

## At a glance

<md-params />

## Parameters

**Delay** sets the offset in samples (0 to 2048) between each sample and the sample it is averaged with. The offset wraps around the end of the frame, so a Delay of 0 or 2048 leaves the signal unchanged.

**Iter** sets how many times the shift-and-average pass is repeated (1 to 35).

<md-tip>
  Larger **Delay** values pack the peaks closer together, while a higher **Iter**
  makes every peak narrower. Combine both to turn simple waveforms into
  metallic, hollow timbres.
</md-tip>

## How it works

The Comb node averages every sample with the sample <md-latex>D</md-latex> positions ahead of it (wrapping around the frame), where <md-latex>D</md-latex> is **Delay**. It then repeats the same pass on the result, <md-latex>n</md-latex> times in total, where <md-latex>n</md-latex> is **Iter**:

<md-latex>y^{(j)}_i = \tfrac{1}{2}\left(y^{(j-1)}_i + y^{(j-1)}_{(i + D) \bmod 2048}\right)</md-latex>

The gain at harmonic <md-latex>k</md-latex> is therefore:

<md-latex>|H_k| = \left|\cos\left(\frac{\pi k D}{2048}\right)\right|^{n}</md-latex>

Peaks sit at every multiple of <md-latex>2048 / D</md-latex> harmonics and the notches fall halfway between them. There is no feedback loop, so the node is always stable.

The filter has a gain of 1 at DC, so any DC offset in the input passes through unchanged and the overall level drops as peaks get narrower. The **rem DC** and **Norm** buttons on the node interface can be useful here to clean up the result.

## Tutorial: creating resonant comb filters

1. Drop a **Basic shapes** node and a **Comb** node onto the grid, alongside an **Output** node.
2. Connect the Basic shapes node into the input of the Comb node.
3. Route the output to the Output node and adjust the **Delay** and **Iter** parameters to sculpt the resonant overtone structure.

## Good to know

- Because comb filtering creates evenly spaced notches and peaks across the frequency spectrum, it forms the foundational building block for effects like flangers, choruses, and physical modeling synthesis.

## The code

<md-lookup src="../graph/node/comb.rs" />
