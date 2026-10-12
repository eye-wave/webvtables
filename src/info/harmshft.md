Harmonic shift moves all harmonics up or down the frequency spectrum by a linear multiplier, keeping the harmonic relationships intact. This technique is ported from [Vital](https://github.com/mtytel/vital) by Matt Tytel.

## Try it

> hidden node in this demo is a sawtooth wave.

<md-demo nodes='[["Basic shapes", { Shape: "Sawtooth" },true],["Harmonic shift", { Shift: 10.0 }],["Output"]]' />

## At a glance

<md-params />

## Parameters

**Shift** controls how far the harmonics are moved from their original positions (-20.0 to 512.0).

## Tutorial: shifting harmonic frequencies

1. Drop a **Basic shapes** node set to Sawtooth, then add a **Harmonic shift** node and an **Output** node.
2. Connect Basic shapes to Harmonic shift, and Harmonic shift to the Output node.
3. Adjust the **Shift** knob to transpose the entire harmonic content up or down without changing the fundamental pitch in the same way traditional scaling does.

## Good to know

- Unlike inharmonic shift, this node scales all frequencies uniformly, which preserves the musical tuning of the sound while shifting its spectral weight.
