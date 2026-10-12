Spectrum builds a waveform directly by adding individual harmonics together with custom amplitude slopes and phase settings. It needs no input, making it another starting point for wavetable chains.

## Try it

<md-demo
nodes={[["Spectrum", { Count: 16, Slope: 1.8, Select: "All", Sign: "Same" }]'}
/>

This is the real node, running. Drag the knobs to change the harmonic makeup and watch the waveform and spectrum update. Double-click a knob to reset it.

## At a glance

<md-params />

## Parameters

**Count** sets how many harmonics are added into the wave (1 to 256).

**Slope** controls how fast higher harmonics drop off in amplitude (0.0 to 3.0).

**Select** filters which harmonics are included:

| Select | Effect                                    |
| ------ | ----------------------------------------- |
| All    | includes every harmonic                   |
| Odd    | keeps only odd harmonics (1, 3, 5, etc.)  |
| Even   | keeps only even harmonics (2, 4, 6, etc.) |

**Sign** chooses whether alternating harmonics are inverted:

| Sign      | Effect                                |
| --------- | ------------------------------------- |
| Same      | all harmonics have standard polarity  |
| Alternate | flips the sign of every even harmonic |

<md-tip>
  Setting **Select** to Odd and **Sign** to Alternate is a quick way to build
  hollow, square-like waveforms with precise control over the upper harmonic
  roll-off.
</md-tip>

## Tutorial: building a custom timbre

1. Open the backpack and drag a **Spectrum** node onto the grid, then add an **Output** node.
2. Connect Spectrum's output socket to Output's input socket.
3. Increase the **Count** parameter to add more overtones, and adjust the **Slope** knob to control the brightness of the resulting sound.

## Good to know

- Like Basic shapes, this node has no input and always starts a chain, allowing you to design entirely custom waveforms from the harmonic series up.
