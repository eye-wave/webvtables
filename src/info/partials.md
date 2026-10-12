Partials generates a waveform by combining a series of sine waves with custom spacing. It needs no input, serving as another starting point for wavetable chains.

## Try it

<md-demo nodes='[["Partials", { Count: 8, Gap: 0 }]]'></md-demo>

This is the real node, running. Drag the knobs to change Count and Gap and watch the waveform and spectrum update. Double-click a knob to reset it.

## At a glance

<md-params />

## Parameters

**Count** sets how many partials are added into the wave (1 to 48).

**Gap** sets how many harmonics are skipped between two neighboring partials (0 to 48). A Gap of 0 gives the harmonics 1, 2, 3 and so on, a Gap of 1 gives 1, 3, 5, and so on.

<md-tip>
  Increasing the **Gap** parameter skips over intermediate harmonics, creating
  hollow, metallic, or bell-like timbres with wide spaces in the frequency
  spectrum.
</md-tip>

## How it works

Partials adds up <md-latex>C</md-latex> sine waves of equal strength, where <md-latex>C</md-latex> is **Count**. With <md-latex>G</md-latex> as **Gap**, partial number <md-latex>i</md-latex> sits on harmonic <md-latex>h_i</md-latex>:

<md-latex>h_i = 1 + i \cdot (G + 1), \qquad y_n = \frac{1}{C} \sum_{i=0}^{C-1} \sin\left(\frac{2\pi\thinspace h_i\thinspace n}{2048}\right)</md-latex>

The sum is divided by <md-latex>C</md-latex> so that the level stays under control.

## Tutorial: building additive timbres

1. Open the backpack and drag a **Partials** node onto the grid, then add an **Output** node.
2. Connect Partials to the Output node.
3. Adjust the **Count** and **Gap** knobs to sculpt the harmonic spectrum from the ground up.

## Good to know

- Like other source nodes, Partials requires no input and scales the output level automatically based on the number of active partials.
- A frame can only hold harmonics up to 1024. Large **Count** and **Gap** values reach higher than that (the top partial is at harmonic <md-latex>1 + 47 \cdot 49 = 2304</md-latex>), and those partials fold back down as aliasing.

## The code

<md-lookup src="../graph/node/partials.rs" />
