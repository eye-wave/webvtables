Perlin Noise generates smooth, organic, random-looking waveforms by layering octaves of [gradient noise](https://en.wikipedia.org/wiki/Perlin_noise). Unlike **Noise**, neighboring samples are related, so the wave drifts and curves instead of jumping. It needs no input, serving as a starting point for wavetable chains.

## Try it

<md-demo
nodes='[["Perlin Noise", { Seed: 7, Octaves: 4, Persistence: 0.5, Frequency: 4 }]]'
/>

This is the real node, running. Drag the knobs to change the settings and watch the waveform and spectrum update. Double-click a knob to reset it.

## At a glance

<md-params />

## Parameters

**Seed** (0 to 65535) sets the random starting value. The same Seed always gives the same frame.

**Octaves** (1 to 12) sets how many layers of noise are added. Each layer has twice as many bumps as the one before it, so more octaves add finer detail.

**Persistence** (0.0 to 1.0) sets how loud each layer is compared to the one before it. At 0 only the first layer is heard and the wave stays smooth. At 0.5 every layer is half as loud as the last, and at 1 all layers are equally loud, which makes the wave rough.

**Frequency** (1 to 128) sets how many noise cells the frame is divided into for the first layer. It is roughly the number of wobbles you see across the frame, so low values make slow, wide curves and high values make busier ones.

<md-tip>
  Animate **Persistence** in the keyframes panel for a smooth morph from a
  gentle curve to a rough one. The random values stay fixed while it moves.
  Animating **Seed** instead gives a completely different wave on every frame.
</md-tip>

## How it works

Seed fills a table of random gradients <md-latex>g_j \in [-1, 1)</md-latex>, using the same Wyrand generator as the **Noise** node. The table has <md-latex>F \cdot 2^{O-1}</md-latex> entries, where <md-latex>F</md-latex> is **Frequency** and <md-latex>O</md-latex> is **Octaves**, but never more than 128.

Layer number <md-latex>o</md-latex> (counting from 0) cuts the frame into <md-latex>c_o = \min(F \cdot 2^o, \text{table size})</md-latex> cells. Inside cell <md-latex>i</md-latex>, at the position <md-latex>t \in [0, 1)</md-latex> within that cell, the layer is

<md-latex>v = g_i \thinspace t + \big(g_{i+1} (t - 1) - g_i \thinspace t\big) \cdot f(t), \qquad f(t) = 6t^5 - 15t^4 + 10t^3</md-latex>

The curve <md-latex>f(t)</md-latex> blends between the two neighboring gradients smoothly, and every layer is exactly 0 at the edges of its cells. The layers are added with the level <md-latex>P^o</md-latex>, where <md-latex>P</md-latex> is **Persistence**, and divided by the sum of those levels. At the end the average is subtracted, and the whole frame is scaled so that its loudest sample reaches exactly <md-latex>\pm 1</md-latex>.

## Tutorial: growing a smooth wave

1. Open the backpack and drag a **Perlin Noise** node onto the grid, then add an **Output** node.
2. Connect Perlin Noise to the Output node.
3. Set **Octaves** to 1 and change **Frequency** to see how many wobbles one layer makes.
4. Raise **Octaves** and **Persistence** to add finer and louder detail on top.
5. Change **Seed** to roll a new wave with the same character.

## Good to know

- The table never holds more than 128 gradients, so the finest layer has at most 128 cells. Once <md-latex>F \cdot 2^{O-1}</md-latex> reaches 128, extra Octaves stop adding new detail and just add more of that same finest layer. With a Frequency of 4, the useful Octaves go up to 6.
- All layers read the same table of gradients, so they are related to each other instead of being independent.
- With Frequency 1 and Octaves 1 the frame is one smooth swing that is very close to a sine. Seed then only decides whether it starts upward or downward.
- The average is removed, so there is no DC offset. Every layer starts and ends at 0, so the frame loops without a jump.
- Unlike the white noise of **Noise**, this wave has most of its energy in the low harmonics, so it works well as a modulation shape or as a soft starting point for filters and effects.

## The code

<md-lookup src="../graph/node/perlin_noise.rs" />
