Basic shapes is where most wavetables begin. It draws one of four classic waveforms across the 2048-sample frame and needs no input, so anything you connect after it (filters, distortion, spectral nodes) has something to work on.

## Try it

<md-demo nodes='[["Basic shapes",{"Shape":"Sawtooth","Repeats":3}]]'></md-demo>

## At a glance

<md-params></md-params>

## Parameters

**Shape** picks the waveform:

| Shape    | Looks like                                | Sounds like                                      |
| -------- | ----------------------------------------- | ------------------------------------------------ |
| Sine     | one smooth round wave                     | a pure tone with no overtones                    |
| Triangle | straight ramps up and down                | soft and hollow, odd harmonics that fade quickly |
| Square   | flat top, flat bottom                     | hollow and buzzy, odd harmonics                  |
| Sawtooth | a ramp from -1 up to +1, then a jump back | bright, every harmonic present                   |

**Repeats** (1 to 100) is how many cycles fit into the frame. It is always a whole number, so the cycles line up and the frame loops without a click. In a wavetable synth, Repeats 2 plays one octave higher than Repeats 1, and Repeats 3 an octave and a fifth higher.

<md-tip>

Square and Sawtooth are drawn as perfect, sharp-edged shapes, not band-limited ones. They contain harmonics all the way up the spectrum, and at high Repeats they can alias. Keep Repeats low or soften them with a filter.

</md-tip>

## Tutorial: your first wavetable

1. Open the backpack and drag **Basic shapes** onto the grid, then drag an **Output** node next to it.
2. Connect Basic shapes' output socket to Output's input socket. The waveform and spectrum on the Output node come alive, and the preview in the bottom-right corner fills with 256 identical frames.
3. Switch **Shape** to Sawtooth. Every frame changes at once, so the preview stays flat along the time axis.
4. Make it move. In the keyframes panel, add a lane and use it to sweep **Repeats** from 1 to 8 over the 256 frames. In the preview the cycles multiply from the first frame to the last, which gives you a table that climbs up the harmonic series.
5. Shape is a choice, not a number, so a lane steps through the four shapes instead of blending them. To glide from one shape to another, feed two Basic shapes nodes into an **Add** node and animate its **Crossfade**.

## Good to know

- There is no input, so this node always starts a chain. Use as many as you like and combine them.
- Sine is read from an exact table, so it is perfectly clean. Triangle, Square and Sawtooth are computed from a running phase.
