Invert polarity flips the positive and negative signs of an audio waveform.

## Try it

<md-demo
nodes='[
["Basic shapes", { Shape: "Sine" }],
["Invert polarity", {}],
]'
/>

## At a glance

<md-params />

## Parameters

This node has no adjustable parameters.

## How it works

Every sample is multiplied by <md-latex>-1</md-latex>:

<md-latex>y_i = -x_i</md-latex>

The shape of the wave is mirrored around the zero line, so the sound is the same but its phase is flipped by 180 degrees. If you mix an inverted signal with the original at equal levels (for example with an **Add** node), they cancel out completely.

## The code

<md-lookup src="../graph/node/invert.rs" />
