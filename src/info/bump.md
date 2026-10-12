Bump generates a smooth bell-shaped curve or modulation envelope across the buffer, acting as a control signal source or window function. Read more on the [Window function](https://en.wikipedia.org/wiki/Window_function) via Wikipedia.

## Try it

<md-demo nodes='[["Bump", { Width: 0.2, Center: 0.5, Polarity: "Unipolar" }]]'></md-demo>

## At a glance

<md-params />

## Parameters

**Width** sets how wide the bump is (0.01 to 1.0, on a logarithmic scale). At 1.0 the bump is a plain raised cosine, and smaller values make it progressively narrower and more pointed.

**Center** sets the position or peak location of the bump across the buffer (0.0 to 1.0).

**Polarity** selects the output range format:

| Polarity | Effect                                  |
| -------- | --------------------------------------- |
| Unipolar | outputs values ranging from 0.0 to 1.0  |
| Bipolar  | outputs values ranging from -1.0 to 1.0 |

<md-tip>
  Using a narrow **Width** allows you to create sharp, impulse-like control
  curves or custom window shapes for modulation.
</md-tip>

## How it works

The Bump node acts as a source generator. For each sample position <md-latex>p \in [0, 1)</md-latex> across the buffer it computes a raised cosine centered on <md-latex>c</md-latex> (**Center**) and raises it to the power <md-latex>1/w</md-latex> (**Width**):

<md-latex>v = \left(\tfrac{1}{2} + \tfrac{1}{2}\cos\big(2\pi (p - c)\big)\right)^{1/w}</md-latex>

It scales the resulting shape into either a unipolar or bipolar range depending on the **Polarity** setting, producing a custom control signal without requiring an audio input. In **Bipolar** mode the result is <md-latex>2v - 1</md-latex>.

## Tutorial: generating custom control curves

1. Drop a **Bump** node onto the grid, alongside an **Output** node.
2. Connect the output of the Bump node directly to the Output node.
3. Adjust the **Center**, **Width**, and **Polarity** parameters to shape the generated modulation curve.

## Good to know

- The curve is periodic over the buffer, so a **Center** close to 0.0 or 1.0 makes the bump wrap around and appear at both edges.
- Because it functions entirely as an internal control source with zero inputs, it is lightweight and highly useful for driving parameter automation, envelope shaping, or amplitude windowing.

## The code

<md-lookup src="../graph/node/bump.rs" />
