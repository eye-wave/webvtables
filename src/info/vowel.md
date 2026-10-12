Vowel Filter simulates vocal tract resonances by applying formant filters to an audio signal, shaping its frequency spectrum to sound like spoken vowels.

## Try it

<md-demo
nodes='[
["Basic shapes", { Shape: "Sawtooth" }],
["Vowel Filter", { Vowel: 0.0, Freq: 9.09, Q: 6.0, Mix: 100.0 }],
]'
/>

This is the real node, running. Drag the knobs to change the vowel parameters and watch the formant peaks shift. Double-click a knob to reset it.

## At a glance

<md-params />

## Parameters

**Vowel** morphs smoothly through five classic vowel sounds (0.0 to 4.0):

- **0.0:** "ɑ" (ah) sound
- **1.0:** "ɛ" (eh) sound
- **2.0:** "i" (ee) sound
- **3.0:** "ɔ" (aw, close to oh) sound
- **4.0:** "u" (oo) sound

Values in between blend the formant frequencies of the two neighboring vowels.

**Freq** scales the formant frequency placement across bins (1 to 2048, on a logarithmic scale). It is the bin that a formant at 1000 Hz lands on, so the formants follow your pitch: the default of 9.09 suits a fundamental of about 110 Hz (<md-latex>1000 / 9.09</md-latex>).

**Q** adjusts the resonance sharpness or bandwidth of the formant peaks (1.0 to 30.0).

**Mix** blends between the original dry signal and the filtered wet signal (0% to 100%).

<md-tip>
  Sweeping the **Vowel** parameter using a keyframe lane creates talking
  synthesizer effects or vocal movement from a static input wave.
</md-tip>

## How it works

Each vowel is described by three formants (the resonant peaks of the vocal tract):

| Vowel | F1 (Hz) | F2 (Hz) | F3 (Hz) |
| ----- | ------- | ------- | ------- |
| 0.0 (ah) | 730  | 1090    | 2440    |
| 1.0 (eh) | 530  | 1840    | 2480    |
| 2.0 (ee) | 270  | 2290    | 3010    |
| 3.0 (aw) | 570  | 840     | 2410    |
| 4.0 (oo) | 300  | 870     | 2240    |

The node takes the FFT of the input and multiplies every bin <md-latex>k</md-latex> by the sum of three resonance curves, one per formant. With <md-latex>f_c = F \cdot \text{Freq} / 1000</md-latex> as the center bin of a formant (<md-latex>F</md-latex> in Hz), <md-latex>x = k / f_c</md-latex> and <md-latex>Q</md-latex> as the **Q** value:

<md-latex>m_k = \sum_{j=1}^{3} \frac{A_j}{\sqrt{1 + Q^2 \left(x_j - 1/x_j\right)^2}}, \qquad A = (1,\ 0.5,\ 0.25)</md-latex>

So the first formant is the strongest and the third the weakest. Bins far away from every formant, and the lowest bin (DC), are cut. The result is blended with the dry signal as <md-latex>1 + \text{mix} \cdot (m_k - 1)</md-latex> per bin.

## Tutorial: making a synth talk

1. Drop a **Basic shapes** node set to Sawtooth, then add a **Vowel Filter** and an **Output** node.
2. Connect Basic shapes to Vowel Filter, and Vowel Filter to the Output node.
3. Sweep the **Vowel** knob back and forth between 0.0 and 4.0 to hear the timbre morph through vowel sounds.

## Good to know

- The display on the node draws the filter's response curve, from -30 dB to +30 dB, with the frequency axis on a logarithmic scale.
- By modeling the resonant frequencies of the human vocal tract, this filter turns bright, harsh waveforms into expressive, vowel-like tones.

## The code

<md-lookup src="../graph/node/vowel.rs" />
