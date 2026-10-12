# webvtables

**Design your own wavetables by connecting nodes together, right in your browser.**

Try it here: **https://eye-wave.github.io/webvtables/**

![The webvtables editor with a small example and the 3D preview](assets/overview.avif)

## How it works

1. **Add nodes.** Each node does one small thing: make a wave, add noise, bend it, filter it, blend two sounds, and so on.
2. **Connect them.** Drag from the circle on one node to the circle on another. The sound flows from left to right into the **Output** node at the end.
3. **Listen and watch.** Press play to hear it. The preview shows all 256 waves at once.
4. **Export.** Save the result as a `.wav` file.

<center>

![The search menu for adding a new node to the graph](assets/add-node.avif)
![Dragging node from backpack into the grid](assets/add-node-backpack.avif)

</center>

<center>

![Three nodes connected together, each showing its wave and knobs](assets/connected-nodes.avif)
![Three nodes connected together, each showing its wave and knobs](assets/connected-nodes-2.avif)

</center>

## What you can do

- **Over 40 building blocks.** Wave generators, filters, distortion, ways to blend two sounds, and tools that reshape a wave in unusual ways.
- **Built-in guides.** Open the backpack to browse every node. Each one has a short explanation and a live example you can play with.
- **Change things over time.** Keyframes let a knob move across the 256 waves, by hand-placed points, a wobble (LFO), randomness, or a crossfade.
- **Use your own sounds or pictures.** The Data node can turn an audio file or an image into a wave.
- **Keep things tidy.** Group nodes together and duplicate whole pieces.
- **Save your work.** Projects save as `.wtp` files (`.wtx` when they include your own files) and can be opened again later.

![The keyframes panel with a few lanes changing knobs over time](assets/keyframes.avif)

![A node guide window with an explanation and a live example](assets/node-guide.avif)

## Handy tips

- **Zoom and move around:** scroll to zoom, drag an empty spot to pan. On a touch screen, pinch.
- **Add a node:** double-click an empty spot, or right-click and choose _Add node..._.
- **Right-click a node** to duplicate it, reset its knobs or delete it.
- **Knobs:** drag to change, double-click to reset, hold **Ctrl** and click to type an exact value.
- **Shortcuts:** `Ctrl+S` save, `Ctrl+O` open, `Ctrl+E` export.
- **Preview map:** click it to switch between flat and 3D.
- **Sound:** it pauses on its own when you switch to another tab or window and continues when you come back.

## Exporting

Open **Export** to save a `.wav` with all 256 waves (32-bit float). Choose a lower _Quality_ if you want a smaller file with fewer waves.

![The project window with the Save and Export options](assets/export.avif)

## Integrating with real synthesizers

webvtables is designed to fit into a real music production workflow. You can export finished wavetable as a `.wav` file and import it into a compatible synth in a real DAW.

Examples of compatible synthesizers include:

- [Serum by Xfer Records](https://xferrecords.com/products/serum)
- [Vital by Matt Tytel](https://vital.audio/)

The workflow is straightforward:

1. design in webvtables
1. export to `.wav`
1. drag downloaded file into your synth of choice

- It works best on a computer. On a very narrow screen you will see a notice asking for a wider view; turning smarphone or tablet sideways usually helps.
- Private by design. Everything runs locally in your browser. Your files are processed on your device and are never uploaded to a server.

## License

**webvtables is licensed under the GNU General Public License v3.0 (GPL-3.0).** The application as a whole is free and open-source software under this license.

The _Harmonic shift_ and _Inharmonic shift_ nodes contain code ported from [Vital](https://github.com/mtytel/vital) by Matt Tytel. This ported code is also distributed under **GPL-3.0**, in accordance with the applicable licensing terms.

You may use, study, modify and redistribute the software under the terms of GPL-3.0. When distributing covered versions or derivative works, you must comply with the license's requirements, including applicable source-code availability and license-notice obligations.

See the repository's `LICENSE` file for the full license text.
