Rectify transforms incoming audio waveforms by folding negative signals into positive amplitudes or inverting them, acting as a wavefolder or absolute-value distortion effect.

## Try it

<md-demo
nodes='[
["Basic shapes", { Shape: "Sine" }],
["Rectify", { Mode: "Full", Mix: 100.0 }],
]'
/>

## At a glance

<md-params />

## Parameters

**Mode** selects the rectification type:

| Mode     | Effect                                                         |
| -------- | -------------------------------------------------------------- |
| Full     | absolute value folding, inverting negative waves into positive |
| Half     | clips and zeroes out all negative portions of the signal       |
| Negative | folds the wave like Full, then flips the result below zero     |

**Mix** blends the dry input signal with the processed rectified signal (0.0% to 100.0%).

<md-tip>
  Using **Full** rectification on a low-frequency sine wave doubles its
  fundamental frequency, creating an instant octave-up harmonic effect.
</md-tip>

## How it works

The Rectify node iterates sample by sample over the input buffer, applying mathematical transformations based on the selected **Mode**. With <md-latex>x</md-latex> as the input sample and <md-latex>r</md-latex> as the rectified sample:

| Mode     | Rectified sample                          |
| -------- | ----------------------------------------- |
| Full     | <md-latex>r = \lvert x \rvert</md-latex>  |
| Half     | <md-latex>r = \max(x, 0)</md-latex>       |
| Negative | <md-latex>r = -\lvert x \rvert</md-latex> |

The resulting waveform is then blended with the original dry signal according to the **Mix** parameter: <md-latex>\text{out} = x + \text{mix} \cdot (r - x)</md-latex>.

## Tutorial: generating harmonics via rectification

1. Drop a **Basic shapes** node (set to Sine) and a **Rectify** node onto the grid, along with an **Output** node.
2. Connect the Basic shapes node into the input of the Rectify node, and route the Rectify node output to the Output node.
3. Switch between **Full**, **Half**, and **Negative** modes while adjusting the **Mix** parameter to hear how each setting shapes the harmonic overtone structure.

## Good to know

- All three modes move the average level of the wave away from zero, so the output has a DC offset. The **rem DC** button on the node interface removes it.
- Because rectification creates sharp inflection points and cusps in the waveform, it introduces high-frequency harmonics that enrich simpler waveforms like sines and triangles.

## The code

<md-lookup src="../graph/node/rectify.rs" />
