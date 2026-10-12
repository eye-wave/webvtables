Bend warps the waveform along the time axis by stretching or compressing parts of the cycle. It changes the timbre by bunching samples together or spreading them out.

## Try it

<md-demo
nodes='[
["Basic shapes", { Shape: "Sine" }],
["Bend", { Amount: 1.0 }],
]'
/>

## At a glance

<md-params />

## Parameters

**Amount** controls the direction and intensity of the time warp (-2.0 to 2.0):

| Amount   | Effect                                               |
| -------- | ---------------------------------------------------- |
| 0.0      | no warping (bypassed)                                |
| Positive | stretches the start of the cycle, compresses the end |
| Negative | compresses the start of the cycle, stretches the end |

## How it works

For every output position <md-latex>p \in [0, 1)</md-latex> across the buffer, Bend reads the input at a warped position <md-latex>q</md-latex>, interpolating linearly between neighboring samples:

<md-latex>q = p^{\thinspace 2^{3a}}</md-latex>

where <md-latex>a</md-latex> is **Amount**. At <md-latex>a = 0</md-latex> the exponent is <md-latex>1</md-latex> and nothing changes. For positive <md-latex>a</md-latex> the exponent is above 1, so the first part of the output only reads the very beginning of the input, which stretches the start and squeezes the end. Negative <md-latex>a</md-latex> does the opposite.

## Tutorial: skewing a sine wave

1. Drop a **Basic shapes** node set to Sine, then add a **Bend** node and an **Output** node.
2. Connect Basic shapes to Bend, and Bend to the Output node.
3. Turn up the **Amount** knob to skew the wave, turning a smooth tone into a sharper, nasal sound packed with new harmonics.

## Good to know

- By stretching the waveform non-linearly across the buffer, Bend creates asymmetrical shapes that add rich overtones even to simple inputs like sines or triangles.

## The code

<md-lookup src="../graph/node/bend.rs" />
