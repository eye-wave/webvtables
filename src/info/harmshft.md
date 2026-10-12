Harmonic shift stretches or compresses the spacing between harmonics by a constant multiplier, so the harmonics stay evenly spaced while the fundamental stays where it is. This technique is ported from [Vital](https://github.com/mtytel/vital) by Matt Tytel.

## Try it

> hidden node in this demo is a sawtooth wave.

<md-demo nodes='[["Basic shapes", { Shape: "Sawtooth" },true],["Harmonic shift", { Shift: 10.0 }],["Output"]]' />

## At a glance

<md-params />

## Parameters

**Shift** controls how far the harmonics are moved from their original positions (-20.0 to 512.0). It sets the spacing multiplier <md-latex>m = 1 + 0.05 \cdot \text{Shift}</md-latex>, so a Shift of 0 leaves the sound unchanged, 20 doubles the spacing (<md-latex>m = 2</md-latex>) and -10 halves it (<md-latex>m = 0.5</md-latex>). At -20 the multiplier is 0 and every harmonic collapses onto the fundamental.

## How it works

The node takes the FFT of the input and moves harmonic <md-latex>k</md-latex> to the position

<md-latex>k' = 1 + (k - 1) \cdot m</md-latex>

so the fundamental (<md-latex>k = 1</md-latex>) never moves and every other harmonic moves away from it (or towards it) in proportion to its distance. When <md-latex>k'</md-latex> is not a whole number, the harmonic is split between the two neighboring bins. Harmonics that land above the highest bin are discarded, and the result is scaled back to the peak level of the input.

## Tutorial: shifting harmonic frequencies

1. Drop a **Basic shapes** node set to Sawtooth, then add a **Harmonic shift** node and an **Output** node.
2. Connect Basic shapes to Harmonic shift, and Harmonic shift to the Output node.
3. Adjust the **Shift** knob to spread the harmonics further apart or squeeze them closer together. The fundamental stays at the same pitch, unlike with a regular pitch shift.

## Good to know

- Unlike Inharmonic shift, every harmonic is moved with the same multiplier, so the harmonics remain evenly spaced. Inharmonic shift moves higher harmonics more than lower ones, which breaks that even spacing.

## The code

<md-lookup src="../graph/node/harmonic_shift.rs" />
