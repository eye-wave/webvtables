Inharmonic shift stretches the harmonic spectrum of a sound, making it metallic or bell-like.
It shifts harmonics away from their natural integer ratios, a technique ported from [Vital](https://github.com/mtytel/vital) by Matt Tytel.

## Try it

> hidden node in this demo is a sawtooth wave.

<md-demo nodes='[["Basic shapes",{Shape:"Sawtooth"},true],["Inharmonic shift",{Shift:25}],["Output"]]'></md-demo>

## At a glance

<md-params />

## Parameters

**Shift** controls how far the harmonics are displaced from their original positions (-20.0 to 512.0).

## Tutorial: creating metallic textures

1. Drop a **Basic shapes** node set to Sawtooth, then add an **Inharmonic shift** node and an **Output** node.
2. Connect Basic shapes to Inharmonic shift, and Inharmonic shift to the Output node.
3. Turn up the **Shift** knob to transform the warm sawtooth wave into a glassy, bell-like timbre.

## Good to know

- Because this node alters the mathematical ratios between overtones, it breaks standard harmonic tuning and creates complex, evolving textures well-suited for sci-fi effects and modern synth patches.
