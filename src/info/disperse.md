Disperser smears frequencies across time by shifting their phase. It alters the transient shape and texture of a sound without changing its volume levels.

## Try it

<md-demo
nodes='[
["Basic shapes", { Shape: "Sawtooth" }],
["Disperser", { Exponent: 2.2 }],
]'
/>

## At a glance

<md-params />

## Parameters

**Exponent** controls the amount and direction of phase dispersion (-10.0 to 10.0):

| Exponent | Effect                                                                   |
| -------- | ------------------------------------------------------------------------ |
| 0.0      | practically bypassed (only a tiny constant phase rotation)               |
| Positive | moves higher frequencies earlier in the frame                            |
| Negative | moves higher frequencies later in the frame                              |

The further the exponent is from 0, the faster the effect grows with frequency, so the high end is smeared much more than the low end.

## How it works

Disperser takes the FFT of the input and rotates the phase of every bin <md-latex>k</md-latex> (except DC) by an angle that grows as a power of the bin number, then converts the result back:

<md-latex>\theta_k = \pm\thinspace \frac{2\pi}{2048}\thinspace k^{|e|}</md-latex>

where <md-latex>e</md-latex> is **Exponent** and the sign follows the sign of <md-latex>e</md-latex>. Because the phase of each bin changes at a different rate, frequencies are shifted in time by different amounts (the group delay is <md-latex>e \cdot k^{|e|-1}</md-latex> samples). Exponent 1 shifts everything by exactly one sample, and larger values bend the phase much faster, smearing sharp transients across the frame.

## Tutorial: shaping transients

1. Drop a **Basic shapes** node set to Sawtooth, then add a **Disperser** and an **Output** node.
2. Connect Basic shapes to Disperser, and Disperser to the Output node.
3. Sweep the **Exponent** slider to hear the waveform stretch out and take on a hollow or metallic character.

## Good to know

- Because this is an all-pass effect, the volume and frequency spectrum remain identical while the time alignment of individual frequencies shifts.

## The code

<md-lookup src="../graph/node/disperser.rs" />
