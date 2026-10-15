Slew Limiter caps how fast a waveform can rise or fall from one sample to the next, turning steep edges into ramps. A negative Amount slows down the rises and a positive Amount slows down the falls. Read more on [Slew rate](https://en.wikipedia.org/wiki/Slew_rate) via Wikipedia.

## Try it

> hidden node in this demo is a sine wave.

<md-demo
nodes='[
["Basic shapes", { Shape: "Sine" }, true],
["Slew Limiter", { Amount: -0.5 }],
]'
/>

## At a glance

<md-params />

## Parameters

**Amount** (-1.0 to 1.0) sets how strict the limit is and which direction it applies to:

| Amount   | Effect                                                        |
| -------- | ------------------------------------------------------------- |
| 0        | the signal passes through unchanged                           |
| negative | rising edges are slowed down, falling edges stay as they were |
| positive | falling edges are slowed down, rising edges stay as they were |
| -1 or 1  | the strictest limit                                           |

<md-tip>
  A negative Amount makes the wave lag behind its input, so peaks move later.
  A positive Amount makes the wave start falling early, so peaks move earlier.
  On a sine at -0.5 or 0.5 the peak moves about 220 samples, a tenth of the frame.
</md-tip>

## How it works

The node finds the biggest jump between neighboring samples in the input, <md-latex>d_{max}</md-latex>, including the jump from the last sample back to the first. The most any step is allowed to rise or fall is

<md-latex>L = d_{max} \cdot \max(1 - \lvert\text{Amount}\rvert,\ 0.001)</md-latex>

so the limit is relative to the input and goes from no limit at Amount 0 down to a thousandth of the steepest step at -1 or 1. With <md-latex>y</md-latex> as the output:

| Amount   | Walk through the frame | Rule                                               |
| -------- | ---------------------- | -------------------------------------------------- |
| negative | first sample to last   | <md-latex>y_i = \min(y_i,\ y_{i-1} + L)</md-latex> |
| positive | last sample to first   | <md-latex>y_i = \min(y_i,\ y_{i+1} + L)</md-latex> |

Walking forward makes a rise take longer to climb, so the wave lags. Walking backward makes a fall start earlier, so the wave leads. Both passes treat the frame as a loop, so a ramp can run across the edge of the frame, and they are repeated up to 8 times until nothing changes anymore.

For a hard edge such as the jump of a Square or Sawtooth, the ramp is about <md-latex>1 / (1 - \lvert\text{Amount}\rvert)</md-latex> samples long, up to a maximum of 1000.

## Tutorial: slewing a waveform

1. Drop a **Basic shapes** node set to Sine, then add a **Slew Limiter** node and an **Output** node.
2. Connect Basic shapes to Slew Limiter, and Slew Limiter to the Output node.
3. Turn **Amount** down to -0.5 and watch the rising half of the wave lean to the right.
4. Turn **Amount** up to 0.5 to lean the falling half instead.
5. Switch Basic shapes to Sawtooth and set **Amount** to 0.99. The sharp drop turns into a long ramp.

## Good to know

- The output is never higher than the input, and it is not scaled back up afterwards. Strong Amounts on a smooth wave cut away a lot of level, and the wave can end up below zero. A full-scale sine at -0.9 sags so far that none of it stays above zero. Follow the node with **Gain** to make up the level.
- Because the limit is relative to the steepest step, a wave with one huge jump (Square or Sawtooth) only has that jump limited, and the rest of the wave is left alone. A smooth wave has no single jump, so a big part of it is reshaped.
- A flat frame, or an Amount of 0, passes through untouched.
- Slew Limiter works sample by sample in the time domain, so it adds new harmonics where the wave is bent.

## The code

<md-lookup src="../graph/node/slew_limit.rs" />
