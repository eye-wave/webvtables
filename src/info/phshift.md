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

**Shift** rotates the waveform cycle in degrees (0.0° to 360.0°).

<md-tip>
  Shifting the phase of one oscillator relative to another before combining them
  can radically change how their waveforms sum together.
</md-tip>

## Tutorial: rotating a waveform

1. Drop a **Basic shapes** node set to Sine, then add a **Phase shift** node and an **Output** node.
2. Connect Basic shapes to Phase shift, and Phase shift to the Output node.
3. Turn the **Shift** knob to slide the wave left or right across the buffer.

## Good to know

- Because the frame wraps around cyclically, rotating the phase past 360° loops the waveform seamlessly back to the beginning.
