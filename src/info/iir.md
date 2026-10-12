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

**Freq** sets the filter cutoff or center frequency in frequency bins (1.0 to 2048.0). The highest frequency a frame can hold is bin 1024, so values above that are limited just below it.

**Gain** sets the boost or cut amount in decibels for shelving and peaking filters (-30.0 dB to 30.0 dB).

**Q** sets the filter resonance or bandwidth (0.0 to 10.0). On the shelf filters it sets the steepness of the slope instead.

**Mix** controls the wet/dry balance of the filtering effect (0.0% to 100.0%).

<md-tip>
  Increasing the **Q** parameter on a lowpass or highpass filter introduces a
  resonance peak that emphasizes frequencies right at the cutoff point, while on
  a peaking filter it makes the boosted band narrower.
</md-tip>

## How it works

The IIR Filter node implements a second-order biquad filter structure operating directly in the time domain. It computes the feedforward coefficients <md-latex>b_0, b_1, b_2</md-latex> and the feedback coefficients <md-latex>a_1, a_2</md-latex> from the selected filter **Shape**, **Freq**, **Gain**, and **Q** parameters, using the standard formulas from the [Audio EQ Cookbook](https://www.w3.org/TR/audio-eq-cookbook/). It then processes each sample in turn:

<md-latex>y_n = b_0 x_n + b_1 x_{n-1} + b_2 x_{n-2} - a_1 y_{n-1} - a_2 y_{n-2}</md-latex>

The cutoff in bins is converted to an angular frequency <md-latex>\omega_0 = 2\pi \cdot \text{Freq} / 2048</md-latex>, and the bandwidth term is <md-latex>\alpha = \sin(\omega_0) / (2Q)</md-latex>. For the Lowpass shape, for example, the unnormalized coefficients are <md-latex>b_0 = b_2 = (1 - \cos\omega_0)/2</md-latex>, <md-latex>b_1 = 1 - \cos\omega_0</md-latex>, <md-latex>a_0 = 1 + \alpha</md-latex>, <md-latex>a_1 = -2\cos\omega_0</md-latex> and <md-latex>a_2 = 1 - \alpha</md-latex>, and all of them are divided by <md-latex>a_0</md-latex>. The result is blended with the dry signal as <md-latex>\text{out} = (1 - \text{mix}) \cdot x + \text{mix} \cdot y</md-latex>.

Unlike FFT-based filter nodes, which convert audio into the frequency domain via block transforms for non-linear spectral manipulation, the IIR filter performs recursive sample-by-sample math, giving it a phase response that changes with frequency (the FFT filter leaves phase untouched), no block latency, and traditional analog synthesizer filtering characteristics.

Each frame is filtered on its own, starting from silence. The filter therefore needs a moment to settle at the start of every frame, and the end of the frame does not wrap smoothly into the start. This can leave a small click or ringing at the loop point of the wavetable, regardless of the active filter shape.

## Tutorial: shaping frequencies with a lowpass filter

1. Drop a **Basic shapes** node (set to Sawtooth) and an **IIR Filter** node onto the grid, alongside an **Output** node.
2. Connect the Basic shapes node into the input of the IIR Filter node.
3. Route the output to the Output node and sweep the **Freq** and **Q** parameters to hear the harmonic sweep.

## Good to know

- Because IIR filters use recursive feedback loops, high resonance settings combined with hot input signals can push the output far above the input level. The node limits the output to a safe range, but you may still want to use the **Norm** or **Clip** buttons.
- The display on the node draws the filter's response curve, from -30 dB to +30 dB, with the frequency axis on a logarithmic scale.

## The code

<md-lookup src="../graph/node/iir_filter.rs" />
