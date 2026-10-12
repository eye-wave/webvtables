XY Merge blends up to four audio input signals across a two-dimensional coordinate plane using bilinear interpolation, acting as a multi-channel quad panner or crossfade matrix.

## Try it

> Hidden nodes in this demo are all _Basic shapes_ nodes, producing Sine, Triangle, Square and Sawtooth cycles in that order.

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
  equally weighting all four incoming signals (each at a quarter of its level).
</md-tip>

## How it works

The XY Merge node takes up to four input buffers and applies bilinear interpolation weights based on the **x** and **y** parameters. It computes independent amplitude gains for each of the four corners of the plane, summing the scaled input samples into a single output buffer. The inputs sit in the corners like this: input 0 at the top left (x = 0, y = 1), input 1 at the top right (x = 1, y = 1), input 2 at the bottom left (x = 0, y = 0) and input 3 at the bottom right (x = 1, y = 0). With <md-latex>x</md-latex> and <md-latex>y</md-latex> as the parameters:

| Input | Gain                                       |
| ----- | ------------------------------------------ |
| 0     | <md-latex>(1 - x) \cdot y</md-latex>       |
| 1     | <md-latex>x \cdot y</md-latex>             |
| 2     | <md-latex>(1 - x)(1 - y)</md-latex>        |
| 3     | <md-latex>x \cdot (1 - y)</md-latex>       |

The four gains always add up to 1. An input that is not connected counts as silence.

Unlike the Add node, which only combines 2 signals, the XY Merge node handles up to 4 concurrent signals, providing smooth, continuous 2D spatial crossfading instead of a one-dimensional crossfade.

## Tutorial: crossfading four sources

1. Drop multiple audio source nodes and an **XY Merge** node onto the grid, alongside an **Output** node.
2. Connect your source nodes into inputs `0` through `3` of the XY Merge node.
3. Route the output to the Output node and adjust the **x** and **y** parameters to morph between the different audio streams.

## Good to know

- Because the gain distribution is calculated via bilinear interpolation across a 2D space, moving the XY coordinates allows for seamless quadraphonic-style mixing without abrupt volume leaps.

## The code

<md-lookup src="../graph/node/xy_merge.rs" />
