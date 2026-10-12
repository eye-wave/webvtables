Band split divides an incoming audio signal into three distinct frequency bands, outputting each band through its own socket for multi-band processing.

## At a glance

<md-params />

## Parameters

**Low band** sets the cutoff frequency (in bins) between the low and middle bands.

**High band** sets the cutoff frequency (in bins) between the middle and high bands.

The node's built-in display visually shows only the lowest band, as it specifically renders the first output channel.

## How it works

The node takes the FFT of the input and gives each output its own slice of the 1024 frequency bins, then converts each slice back to the time domain. With <md-latex>k</md-latex> as the bin index, <md-latex>L</md-latex> as **Low band** and <md-latex>H</md-latex> as **High band**:

| Socket | Bins kept                                     |
| ------ | --------------------------------------------- |
| 0      | <md-latex>0 \le k \lt L</md-latex>              |
| 1      | <md-latex>L \le k \lt H</md-latex>              |
| 2      | <md-latex>H \le k \lt 1024</md-latex>           |

## Tutorial: multi-band processing

1. Drop a **Basic shapes** node and a **Band split** node onto the grid.
2. Connect the Basic shapes output to the Band split input.
3. Add three separate **Output** nodes (or processing nodes like filters or distortion) and connect them to Band split's three output sockets:
   - **Socket 0 (Low):** contains frequencies below the Low band cutoff.
   - **Socket 1 (Mid):** contains frequencies between the Low and High band cutoffs.
   - **Socket 2 (High):** contains frequencies above the High band cutoff.
4. Adjust the **Low band** and **High band** knobs to change where the spectrum is split.

## Good to know

- Because this node outputs three independent signals, you can apply effects like distortion or saturation exclusively to the high end while leaving the low end clean.
- The cuts are exact: every bin belongs to exactly one band, so there is no overlap or gradual roll-off. In some cases you can use it instead of the Filter node.
- The three bands add up to the original signal, so you can process them separately and mix them back together with **Add** nodes.
- The cutoffs are clamped to the 1024 available bins, and if **High band** is set below **Low band** it is treated as equal to it, which leaves the middle band empty.

## The code

<md-lookup src="../graph/node/band_split.rs" />
