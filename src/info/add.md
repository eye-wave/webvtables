Add blends two inputs together. You use it to mix sounds or morph from one waveform into another.

## Try it

> hidden nodes in this demo produce saw and square cycles.

<md-demo nodes='[["Basic shapes",{Shape:"Sawtooth"},true],["Basic shapes",{Shape:"Square"},true],["Add", { Crossfade: 0.0 }]]' />

## At a glance

<md-params />

## Parameters

**Crossfade** sets the balance between the two inputs:

| Range | Effect                      |
| ----- | --------------------------- |
| -1.0  | only plays the first input  |
| 0.0   | an even mix of both inputs  |
| +1.0  | only plays the second input |

<md-tip>
  If you leave an input empty, it counts as silence. Crossfading into an empty
  input acts like a volume control for the active signal.
</md-tip>

## Tutorial: morphing between shapes

1. Drop two **Basic shapes** nodes onto the grid, setting one to Sine and the other to Sawtooth.
2. Add an **Add** node and an **Output** node.
3. Plug the first shape into the first input of Add, and the second shape into the second input.
4. Plug Add into the Output node.
5. In the keyframes panel, animate **Crossfade** from -1.0 to 1.0. This makes the wave smoothly morph from a soft sine into a bright sawtooth.

## Good to know

- If you don't need both inputs, you can use Add as a simple volume knob by sweeping the crossfade toward the active side.
