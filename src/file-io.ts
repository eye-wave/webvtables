export function saveFile(filename: string, bytes: Uint8Array) {
  const blob = new Blob([bytes.buffer as ArrayBuffer], {
    type: "application/octet-stream",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");

  a.href = url;
  a.download = filename;

  document.body.appendChild(a);
  a.click();
  a.remove();

  URL.revokeObjectURL(url);
}

export function loadFile(accept = "*/*"): Promise<Uint8Array> {
  return new Promise((resolve, reject) => {
    const input = document.createElement("input");

    input.type = "file";
    input.accept = accept;

    input.style.display = "none";
    document.body.appendChild(input);

    input.onchange = async () => {
      const file = input.files?.[0];

      input.remove();

      if (!file) {
        reject(new Error("No file selected"));
        return;
      }

      const buffer = new Uint8Array(await file.arrayBuffer());
      resolve(buffer);
    };

    input.click();
  });
}
