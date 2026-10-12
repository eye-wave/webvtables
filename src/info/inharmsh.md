Inharmonic shift stretches the harmonic spectrum of a sound, making it metallic or bell-like.
It shifts harmonics away from their natural integer ratios, a technique ported from [Vital](https://github.com/mtytel/vital) by Matt Tytel.

## Try it

> hidden node in this demo is a sawtooth wave.

<md-demo nodes='[["Basic shapes",{Shape:"Sawtooth"},true],["Inharmonic shift",{Shift:25}],["Output"]]'></md-demo>

## At a glance

<md-params />

## Parameters

**Shift** controls how far the harmonics are displaced from their original positions (-20.0 to 512.0). It sets the multiplier <md-latex>m = 1 + 0.05 \cdot \text{Shift}</md-latex>, so a Shift of 0 leaves the sound unchanged.

## How it works

The node takes the FFT of the input and moves harmonic <md-latex>k</md-latex> to the position

<md-latex>k' = 1 + (k - 1) \cdot m^{\log_2(k) / 10}</md-latex>

The exponent grows with the logarithm of the harmonic number, from 0 for the fundamental up to 1 at harmonic 1024. The fundamental and the lowest harmonics barely move, while the top of the spectrum is scaled by nearly the full multiplier <md-latex>m</md-latex>. That uneven stretch breaks the integer ratios between harmonics. When <md-latex>k'</md-latex> is not a whole number, the harmonic is split between the two neighboring bins, harmonics landing above the highest bin are discarded, and the result is scaled back to the peak level of the input.

## Tutorial: creating metallic textures

1. Drop a **Basic shapes** node set to Sawtooth, then add an **Inharmonic shift** node and an **Output** node.
2. Connect Basic shapes to Inharmonic shift, and Inharmonic shift to the Output node.
3. Turn up the **Shift** knob to transform the warm sawtooth wave into a glassy, bell-like timbre.

## Good to know

- Because this node alters the mathematical ratios between overtones, it breaks standard harmonic tuning and creates complex, evolving textures well-suited for sci-fi effects and modern synth patches.

## The code

<md-lookup src="../graph/node/inharmonic_shift.rs" />
