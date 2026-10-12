XY Merge blends up to four audio input signals across a two-dimensional coordinate plane using bilinear interpolation, acting as a multi-channel quad panner or crossfade matrix.

## Try it

> Hidden nodes in this demo are all: _Basic shape_ nodes producing Sine, Triangle, Square, Sawtooth cycles in that order.

<md-demo
  nodes='[
    ["Basic shapes", { Shape: "Sine" },true],
    ["Basic shapes", { Shape: "Triangle" },true],
    ["Basic shapes", { Shape: "Square" },true],
    ["Basic shapes", { Shape: "Sawtooth" },true],
    ["XY Merge", { x: 0.5, y: 0.5 }],
  ]'
/>

This is the real node, running. Connect multiple audio sources to crossfade and position them in a 2D space in real time.

## At a glance

<md-params />

## Parameters

**x** sets the horizontal position across the 2D plane (0.0 to 1.0).

**y** sets the vertical position across the 2D plane (0.0 to 1.0).

<md-tip>
  Setting **x** and **y** to 0.5 places the blend precisely in the center,
  equally weighting all four incoming signals.
</md-tip>

## How it works

The XY Merge node takes up to four input buffers and applies bilinear interpolation weights based on the **x** and **y** parameters. It computes independent amplitude gains for each of the four quadrants, summing the scaled input samples into a single output buffer.

Unlike traditional addition or math nodes-which typically combine only 2 signals by summing their amplitudes directly-the XY Merge node handles up to 4 concurrent signals, providing smooth, continuous 2D spatial crossfading instead of fixed addition.

## Tutorial: crossfading four sources

1. Drop multiple audio source nodes and an **XY Merge** node onto the grid, alongside an **Output** node.
2. Connect your source nodes into inputs `0` through `3` of the XY Merge node.
3. Route the output to the Output node and adjust the **x** and **y** parameters to morph between the different audio streams.

## Good to know

- Because the gain distribution is calculated via bilinear interpolation across a 2D space, moving the XY coordinates allows for seamless quadraphonic-style mixing without abrupt volume leaps.
