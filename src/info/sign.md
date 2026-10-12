Sign extracts the polarity of each sample, turning any input waveform into a harsh, maximum-amplitude square wave based on whether the signal is positive or negative.

## Try it

<md-demo
nodes='[
["Basic shapes", { Shape: "Sine" }],
["Sign", {}],
]'
/>

This is the real node, running. Connect an input source to see it clipped into hard square pulses.

## At a glance

<md-params />

## Parameters

This node has no adjustable parameters; it strictly converts any positive sample to 1.0, any negative sample to -1.0, and zeros remain zero.

<md-tip>
  Passing a smooth sine or triangle wave through the Sign node instantly squares
  it off, adding extreme harmonic richness and digital edge.
</md-tip>

## How it works

Every sample is replaced by its sign:

<md-latex>y_i = \operatorname{sgn}(x_i)</md-latex>

Positive samples become <md-latex>+1</md-latex>, negative samples become <md-latex>-1</md-latex>, and samples that are exactly 0 stay 0.

Only the zero crossings of the input survive, so the output switches between +1 and -1 exactly where the input crosses zero.

## Tutorial: squaring off a waveform

1. Drop a **Basic shapes** node set to Sine, then add a **Sign** node and an **Output** node.
2. Connect Basic shapes to the Sign node, and the Sign node to the Output node.
3. Listen to the dramatic transformation from a smooth sine wave into a buzzy, distorted pulse.

## Good to know

- This node acts as an extreme form of hard clipping, reducing any input down to its raw directional sign and maximizing its harmonic content.

## The code

<md-lookup src="../graph/node/sign.rs" />
