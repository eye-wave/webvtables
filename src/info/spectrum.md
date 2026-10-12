Spectrum builds a waveform directly by adding individual harmonics together with custom amplitude slopes and phase settings. It needs no input, making it another starting point for wavetable chains.

## Try it

<md-demo nodes='[["Spectrum", { Count: 16, Slope: 1.8, Select: "All", Sign: "Same" }]]' />

This is the real node, running. Drag the knobs to change the harmonic makeup and watch the waveform and spectrum update. Double-click a knob to reset it.

## At a glance

<md-params />

## Parameters

**Count** sets the highest harmonic that is added into the wave (1 to 256). With **Select** set to Odd or Even only about half of the harmonics up to that number are used.

**Slope** controls how fast higher harmonics drop off in amplitude (0.0 to 3.0). Harmonic <md-latex>h</md-latex> gets the amplitude <md-latex>h^{-\text{Slope}}</md-latex>, so a Slope of 0 gives every harmonic the same strength, 1 gives <md-latex>1/h</md-latex> and 2 gives <md-latex>1/h^2</md-latex>.

**Select** filters which harmonics are included:

| Select | Effect                                    |
| ------ | ----------------------------------------- |
| All    | includes every harmonic                   |
| Odd    | keeps only odd harmonics (1, 3, 5, etc.)  |
| Even   | keeps only even harmonics (2, 4, 6, etc.) |

**Sign** chooses whether alternating harmonics are inverted:

| Sign      | Effect                                                               |
| --------- | -------------------------------------------------------------------- |
| Same      | all harmonics have standard polarity                                 |
| Alternate | flips the sign of every even harmonic (no effect when Select is Odd) |

<md-tip>
  Setting **Select** to Odd with a **Slope** of 1.0 is a quick way to build a
  hollow, square-like waveform, while Select set to All with a Slope of 1.0 gives
  a sawtooth-like one. Raise or lower the Slope to control the upper harmonic
  roll-off. **Sign** set to Alternate flips the direction of that sawtooth ramp.
</md-tip>

## How it works

Spectrum adds sine waves on the selected harmonics <md-latex>h = 1 \ldots C</md-latex> (<md-latex>C</md-latex> is **Count**), each with the amplitude <md-latex>a_h = \pm h^{-s}</md-latex> (<md-latex>s</md-latex> is **Slope**). The sum is then divided by its highest peak, so the result always reaches exactly <md-latex>\pm 1</md-latex>:

<md-latex>y_n = \frac{1}{\max\lvert y \rvert} \sum_{h} a_h \sin\left(\frac{2\pi\thinspace h\thinspace n}{2048}\right)</md-latex>

## Tutorial: building a custom timbre

1. Open the backpack and drag a **Spectrum** node onto the grid, then add an **Output** node.
2. Connect Spectrum's output socket to Output's input socket.
3. Increase the **Count** parameter to add more overtones, and adjust the **Slope** knob to control the brightness of the resulting sound.

## Good to know

- Like Basic shapes, this node has no input and always starts a chain, allowing you to design entirely custom waveforms from the harmonic series up.

## The code

<md-lookup src="../graph/node/spectrum.rs" />
