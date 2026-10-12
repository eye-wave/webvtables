Partials generates a waveform by combining a series of sine waves with custom spacing. It needs no input, serving as another starting point for wavetable chains.

## Try it

<md-emo nodes={[["Partials", { Count: 8, Gap: 0 }]]} d/'

This is the real node, running. Drag the knobs to change Count and Gap and watch the waveform and spectrum update. Double-click a knob to reset it.

## At a glance

<md-params />

## Parameters

**Count** sets how many partials are added into the wave (1 to 48).

**Gap** sets the spacing or empty space between each partial (0 to 48).

<md-tip>
  Increasing the **Gap** parameter skips over intermediate harmonics, creating
  hollow, metallic, or bell-like timbres with wide spaces in the frequency
  spectrum.
</md-tip>

## Tutorial: building additive timbres

1. Open the backpack and drag a **Partials** node onto the grid, then add an **Output** node.
2. Connect Partials to the Output node.
3. Adjust the **Count** and **Gap** knobs to sculpt the harmonic spectrum from the ground up.

## Good to know

- Like other source nodes, Partials requires no input and normalizes the output level automatically based on the number of active partials.
