Pulse wave draws a rectangular waveform across the frame with adjustable pulse width modulation, similar to the square wave in **Basic shapes**. It needs no input, serving as a starting point for wavetable chains.

## Try it

<md-demo nodes='[["Pulse wave", { PWM: 0.25, Repeats: 1 }]]'></md-demo>

This is the real node, running. Drag the knobs to change PWM and Repeats and watch the waveform and spectrum follow. Double-click a knob to reset it.

## At a glance

<md-params />

## Parameters

**PWM** (pulse width modulation) sets the width of the positive part of each cycle, as a fraction of the cycle (0.0 to 0.5). At 0.5 the positive and negative parts are equally wide, which is a square wave. At 0.0 the positive part disappears and the wave is flat at -1.

**Repeats** (1 to 100) sets how many cycles fit into the frame.

<md-tip>
  A narrow PWM setting creates a thin, nasal, and buzzy tone rich in upper
  harmonics, while a setting of 0.5 produces a classic square wave.
</md-tip>

## How it works

With <md-latex>R</md-latex> as **Repeats** and <md-latex>w</md-latex> as **PWM**, the cycle length is <md-latex>P = 2048 / R</md-latex> samples and every sample is

<md-latex>y_n = +1 \text{ if } (n \bmod P) \lt w \cdot P, \quad y_n = -1 \text{ otherwise}</md-latex>

The average level of the wave is <md-latex>2w - 1</md-latex>, so a pulse that is not a square carries a DC offset.

## Tutorial: your first pulse wave

1. Open the backpack and drag a **Pulse wave** node onto the grid, then add an **Output** node.
2. Connect Pulse wave's output socket to Output's input socket.
3. Adjust the **PWM** knob to narrow or widen the pulse width, shifting the harmonic balance.

## Good to know

- Because the positive and negative parts are unequal when PWM is below 0.5, the wave has a DC offset. Click the **rem DC** button on the node interface to remove it.
- Like **Basic shapes**, Pulse wave requires no input and provides a sharp-edged raw waveform that you can shape with filters or effects downstream.

## The code

<md-lookup src="../graph/node/pulse_wave.rs" />
