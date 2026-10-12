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

**Freq** sets the cutoff or center frequency in bins (ranging from 1.0 up to the buffer length).

**Gain** adjusts the boost or cut amount in decibels (from -30 dB to +30 dB), used by the shelf and peaking filters.

**Q** controls the resonance or width of the filter, making peaks sharper or broader.

**Mix** blends between the original dry signal and the filtered wet signal (0% to 100%).

<md-tip>
  Shelf, peaking, and notch filters use the Gain parameter to determine how much
  they boost or cut, whereas standard lowpass and highpass filters ignore Gain.
</md-tip>

## Tutorial: filtering a waveform

1. Drop a **Basic shapes** node set to Sawtooth, then add an **FFT Filter** and an **Output** node.
2. Connect Basic shapes to the FFT Filter, and connect the filter to the Output node.
3. Switch the filter **Shape** to Lowpass.
4. Animate or lower the **Freq** parameter to sweep the cutoff downward, darkening the bright sawtooth sound.
5. Increase the **Q** resonance parameter to add a sharp resonant peak right at the cutoff point.

## Good to know

- Because this filter operates using FFT, it processes the entire frame in the frequency domain rather than sample-by-sample, giving it an exact frequency response curve.
