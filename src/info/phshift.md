Phase shift rotates the waveform along the time axis by a specified angle, shifting the start point of the cycle without changing its pitch or harmonic content.

## Try it

<md-demo
nodes='[
["Basic shapes", { Shape: "Sine" }],
["Phase shift", { Shift: 90.0 }],
]'
/>

## At a glance

<md-params />

## Parameters

**Shift** rotates the waveform cycle in degrees (0.0° to 360.0°). One degree moves the wave by about 5.7 samples, and the shift is rounded down to a whole number of samples.

<md-tip>
  Shifting the phase of one oscillator relative to another before combining them
  can radically change how their waveforms sum together.
</md-tip>

## How it works

Phase shift moves every sample later in the frame and wraps the end of the frame back to the start:

<md-latex>y_n = x_{(n - s) \bmod 2048}, \qquad s = \left\lfloor \frac{\text{Shift}}{360} \cdot 2048 \right\rfloor</md-latex>

For a single cycle that fills the frame this rotates the phase of the fundamental by exactly **Shift** degrees. A harmonic <md-latex>k</md-latex> is rotated by <md-latex>k</md-latex> times as much, because it is the same move in time.

## Tutorial: rotating a waveform

1. Drop a **Basic shapes** node set to Sine, then add a **Phase shift** node and an **Output** node.
2. Connect Basic shapes to Phase shift, and Phase shift to the Output node.
3. Turn the **Shift** knob to slide the wave left or right across the buffer.

## Good to know

- Because the frame wraps around cyclically, nothing is lost at the edges, and a Shift of 360° is the same as 0°.
- With nothing connected to the input, the node outputs silence.

## The code

<md-lookup src="../graph/node/phase_shift.rs" />
