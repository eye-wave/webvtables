Output is the end of the graph. Whatever arrives here is the wavetable: the editor evaluates your graph once for each of the 256 frames, and Output collects the result of every frame.

## Try it

<md-demo nodes='[["Basic shapes",{"Shape":"Square","Repeats":2}],["Output"]]'></md-demo>

The green line is the waveform that reaches the Output, the orange one is its spectrum. Turn Repeats up on the source and the spectrum shifts with it.

## At a glance

<md-params></md-params>

## What it does

- **Feeds the preview.** The heightmap in the bottom-right corner of the grid is drawn from Output's results. Click it to flip between flat and 3D.
- **Feeds the export.** The .wav you export is rendered from Output, not from any other node.
- **Shows the current frame.** The Output node has two small displays: the waveform of the frame under the playhead, and its spectrum.

### Reading the spectrum

The spectrum shows the first 1024 harmonics on a logarithmic scale that spans 80 dB. The top edge is a full-scale sine and the bottom edge is -80 dB. The DC component (harmonic 0) is left out. A sawtooth shows a steady slope of harmonics, a sine shows a single spike, and noise fills the whole display.

<md-tip>

If a project contains several Output nodes, only the oldest one (the first you added) is used for the preview and the export. Delete extras to avoid confusion.

</md-tip>

## Tutorial: hear what you are building

1. Drag an **Output** node onto the grid. With nothing connected, the preview is flat and silent.
2. Add a source such as **Basic shapes** and connect its output socket to Output's input socket.
3. Watch both displays on the Output node while you turn the source's knobs. The waveform tells you the shape, and the spectrum tells you the brightness.
4. Put an effect in between: connect the source to the effect, and the effect to Output. Both displays show what the effect did.
5. Press play in the top bar. The playhead sweeps through the 256 frames and the displays follow it.

## Good to know

- Output has an input and no output socket. It is a dead end by design.
- With nothing connected to its input, the table stays flat.
