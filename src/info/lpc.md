LPC (Linear Predictive Coding) models the spectral envelope of an audio signal by estimating its formants and resonances, commonly used in speech analysis and vocoding. Read more on [Linear predictive coding](https://en.wikipedia.org/wiki/Linear_predictive_coding) via Wikipedia.

## Try it

<md-demo
nodes='[
["Basic shapes", { Shape: "Sawtooth" }],
["Noise", { Algorithm: "Xorshift", Color: "White", Seed: 12345 }],
["LPC", { Mode: "Smooth", Order: 12, Mix: 100.0 }],
]'
/>

This is the real node, running. Connect audio sources to shape the spectral envelope in real time.

## At a glance

<md-params />

## Parameters

**Mode** selects the processing behavior:

| Mode   | Effect                                                                     |
| ------ | -------------------------------------------------------------------------- |
| Smooth | replaces the detailed spectrum of the first input with its smooth envelope |
| Whiten | flattens the input spectrum by removing its resonances                     |
| Cross  | transfers the spectral envelope from the second input onto the first input |

**Order** (1 to 48) sets the number of poles used to model the spectral peaks.

**Mix** blends between the original dry signal and the processed wet signal (0% to 100%).

<md-tip>
  Using **Cross** mode with a harmonic source (like a sawtooth) on input A and
  a vocal sample on input B makes the harmonic source take on the vocal's
  formants, which creates classic robotic vocoder effects.
</md-tip>

## How it works

LPC analyzes the incoming audio waveform by computing its circular autocorrelation sequence over the 2048-sample frame, applying the Levinson-Durbin recursion algorithm to find the linear prediction coefficients. These coefficients define an all-pole filter model that traces the smoothed spectral envelope (formants) of the sound. Depending on the chosen mode, the node either flattens the spectrum (whitening), smooths it based on its own shape, or maps the spectral envelope of a secondary input onto the primary signal.

The all-pole model gives an envelope <md-latex>E_k = G / \lvert A(\omega_k) \rvert</md-latex> at every harmonic <md-latex>k</md-latex>, where <md-latex>A</md-latex> is the prediction filter built from the coefficients <md-latex>a_1 \ldots a_p</md-latex> (<md-latex>p</md-latex> is the **Order**) and <md-latex>G</md-latex> is the gain left over from the prediction error. With <md-latex>X_k</md-latex> as the spectrum of input A, each mode changes the bins as follows (the lowest bin, which holds DC, is left alone):

| Mode   | Result per bin                                                                         |
| ------ | -------------------------------------------------------------------------------------- |
| Smooth | <md-latex>Y_k = X_k \cdot E^A_k / \lvert X_k \rvert</md-latex>, the magnitude becomes the envelope and the phase is kept |
| Whiten | <md-latex>Y_k = X_k / E^A_k</md-latex>                                                  |
| Cross  | <md-latex>Y_k = X_k \cdot E^B_k / E^A_k</md-latex>, where <md-latex>E^B</md-latex> is the envelope of input B |

**Mix** blends the correction per bin, and the result is scaled to a peak level of 1.0 at the end.

## Tutorial: applying vocal tract filtering

1. Drop a **Basic shapes** node and a **Noise** node onto the grid, then add an **LPC** node and an **Output** node.
2. Connect Basic shapes to the first input and Noise to the second input of the LPC node.
3. Switch the **Mode** parameter to **Cross** and adjust the **Order** knob to hear the harmonic source take on the formant characteristics of the secondary input.

## Good to know

- By mathematical necessity, LPC models signals using an all-pole filter representation, making it exceptionally good at tracking peaks like formants while ignoring harmonic fine structure.

## The code

<md-lookup src="../graph/node/lpc.rs" />
