IIR Filter processes audio using recursive biquad filter coefficients, offering classic analog-style filtering across multiple frequency response shapes. Read more on the [Infinite impulse response](https://en.wikipedia.org/wiki/Infinite_impulse_response) via Wikipedia.

## Try it

<md-demo
nodes='[
["Basic shapes", { Shape: "Sawtooth" }],
[
"IIR Filter",
{ Shape: "Lowpass", Freq: 777.77, Gain: 0.0, Q: 1.0, Mix: 100.0 },
],
]'
/>

This is the real node, running. Connect an audio source to filter its frequency content in real time.

## At a glance

<md-params />

## Parameters

**Shape** selects the filter frequency response type:

| Shape     | Effect                                                  |
| --------- | ------------------------------------------------------- |
| Lowpass   | attenuates frequencies above the cutoff frequency       |
| Highpass  | attenuates frequencies below the cutoff frequency       |
| Bandpass  | passes a specific band of frequencies around the center |
| Lowshelf  | boosts or cuts frequencies below the cutoff frequency   |
| Highshelf | boosts or cuts frequencies above the cutoff frequency   |
| Peaking   | boosts or cuts a specific band of frequencies           |
| Notch     | rejects a narrow band of frequencies around the center  |

**Freq** sets the filter cutoff or center frequency in frequency bins (1.0 to 2048.0).

**Gain** sets the boost or cut amount in decibels for shelving and peaking filters (-30.0 dB to 30.0 dB).

**Q** sets the filter resonance or bandwidth (0.0 to 10.0).

**Mix** controls the wet/dry balance of the filtering effect (0.0% to 100.0%).

<md-tip>
  Increasing the **Q** parameter on a peaking or lowpass filter introduces
  resonance peaks that emphasize frequencies right at the cutoff point.
</md-tip>

## How it works

The IIR Filter node implements a second-order biquad filter structure operating directly in the time domain. It computes recursive feedforward and feedback coefficients based on the selected filter **Shape**, **Freq**, **Gain**, and **Q** parameters, processing each sample sequentially to shape the frequency response with minimal latency.

Unlike FFT-based filter nodes-which convert audio into the frequency domain via block transforms for non-linear spectral manipulation-the IIR filter performs recursive sample-by-sample math, yielding smooth phase behavior, zero block latency, and traditional analog synthesizer filtering characteristics.

Because of numerical rounding and coefficient update imperfections, sudden parameter changes or extreme modulation can create sharp transient edges or artifacts that add unwanted high-frequency content, regardless of the active filter mode.

## Tutorial: shaping frequencies with a lowpass filter

1. Drop a **Basic shapes** node (set to Sawtooth) and an **IIR Filter** node onto the grid, alongside an **Output** node.
2. Connect the Basic shapes node into the input of the IIR Filter node.
3. Route the output to the Output node and sweep the **Freq** and **Q** parameters to hear the harmonic sweep.

## Good to know

- Because IIR filters use recursive feedback loops, extreme resonance settings combined with hot input signals can cause internal filter instability or digital clipping.
