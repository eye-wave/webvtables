FFT Filter shapes the frequency spectrum of an audio signal. It applies various filter curves directly in the frequency domain, letting you cut, boost, or shape specific parts of the sound.

## Try it

> hidden node in this demo is a sawtooth wave.

<md-demo
nodes='[
["Basic shapes", { Shape: "Sawtooth" },true],
["FFT Filter", { Shape: "Peaking", Freq: 22, Gain: 18, Q: 2, Mix: 100.0 }],
]'
/>

## At a glance

<md-params />

## Parameters

**Shape** picks the type of filter curve:

| Shape     | Effect                                      |
| --------- | ------------------------------------------- |
| Lowpass   | lets low frequencies through, cuts highs    |
| Highpass  | lets high frequencies through, cuts lows    |
| Bandpass  | keeps frequencies around the center         |
| Lowshelf  | boosts or cuts frequencies below the cutoff |
| Highshelf | boosts or cuts frequencies above the cutoff |
| Peaking   | boosts or cuts a specific frequency band    |
| Notch     | cuts a narrow notch out of the spectrum     |

**Freq** sets the cutoff or center frequency in bins (on a logarithmic scale, from 1.0 up to 2048). Only 1024 bins exist in the spectrum, so values above that have no effect on the upper end.

**Gain** adjusts the boost or cut amount in decibels (from -30 dB to +30 dB), used by the shelf and peaking filters only.

**Q** (0.0 to 10.0) controls the resonance or width of the filter, making peaks sharper or broader. On the shelf filters it controls how steep the transition is instead.

**Mix** blends between the original dry signal and the filtered wet signal (0% to 100%).

<md-tip>
  Shelf and peaking filters use the Gain parameter to determine how much they
  boost or cut, whereas lowpass, highpass, bandpass and notch filters ignore
  Gain.
</md-tip>

## How it works

FFT Filter multiplies each frequency bin <md-latex>k</md-latex> by a gain that depends on <md-latex>x = k / F</md-latex>, where <md-latex>F</md-latex> is **Freq**. With <md-latex>Q</md-latex> as the **Q** value and <md-latex>G = 10^{\text{dB}/20}</md-latex> as the linear **Gain**, let <md-latex>D = (1 - x^2)^2 + x^2 / Q^2</md-latex>. The magnitude responses are:

| Shape     | Gain applied to each bin                                                                         |
| --------- | ------------------------------------------------------------------------------------------------ |
| Lowpass   | <md-latex>1 / \sqrt{D}</md-latex>                                                                |
| Highpass  | <md-latex>x^2 / \sqrt{D}</md-latex>                                                              |
| Bandpass  | <md-latex>(x / Q) / \sqrt{D}</md-latex>                                                          |
| Notch     | <md-latex>\lvert 1 - x^2 \rvert / \sqrt{D}</md-latex>                                            |
| Peaking   | <md-latex>1 + (G - 1) \cdot \dfrac{x^2 / Q^2}{D}</md-latex>                                      |
| Lowshelf  | <md-latex>1 + \dfrac{G - 1}{1 + x^{s}}</md-latex>, with <md-latex>s = 2 \max(Q, 0.15)</md-latex> |
| Highshelf | <md-latex>1 + (G - 1) \cdot \dfrac{x^{s}}{1 + x^{s}}</md-latex>                                  |

At the cutoff (<md-latex>x = 1</md-latex>) a Lowpass has a gain equal to <md-latex>Q</md-latex>, which is why raising Q adds a resonant peak there. The result is blended with the dry signal as <md-latex>1 + \text{mix} \cdot (\text{gain} - 1)</md-latex> per bin.

## Tutorial: filtering a waveform

1. Drop a **Basic shapes** node set to Sawtooth, then add an **FFT Filter** and an **Output** node.
2. Connect Basic shapes to the FFT Filter, and connect the filter to the Output node.
3. Switch the filter **Shape** to Lowpass.
4. Animate or lower the **Freq** parameter to sweep the cutoff downward, darkening the bright sawtooth sound.
5. Increase the **Q** resonance parameter to add a sharp resonant peak right at the cutoff point.

## Good to know

- Because this filter operates using FFT, it processes the entire frame in the frequency domain rather than sample-by-sample, giving it an exact frequency response curve. Only the magnitudes change, the phase of every bin is left alone, so there is no phase shift.
- The display on the node draws the filter's response curve, from -30 dB to +30 dB, with the frequency axis on a logarithmic scale.

## The code

<md-lookup src="../graph/node/filter.rs" />
