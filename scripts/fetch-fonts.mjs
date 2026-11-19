// Downloads latin-subset woff2 files from Google Fonts into src/assets/fonts
import { mkdir, writeFile } from "node:fs/promises";

const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36";

const families = {
  Inter: "family=Inter:ital,wght@0,400..700;1,400..700",
  Poppins: "family=Poppins:ital,wght@0,400;0,500;0,600;1,400",
  Merriweather:
    "family=Merriweather:ital,wght@0,400;0,700;1,400",
  Lora: "family=Lora:ital,wght@0,400..700;1,400..700",
};

const outDir = new URL("../src/assets/fonts/", import.meta.url).pathname.replace(
  /^\/([A-Za-z]:)/,
  "$1"
);
await mkdir(outDir, { recursive: true });

let css = "";

for (const [name, query] of Object.entries(families)) {
  const res = await fetch(`https://fonts.googleapis.com/css2?${query}&display=swap`, {
    headers: { "User-Agent": UA },
  });
  if (!res.ok) throw new Error(`${name}: ${res.status}`);
  const text = await res.text();

  // Split into @font-face blocks, keep only the latin one (U+0000-00FF...)
  const blocks = text.split(/(?=@font-face)/g);
  let kept = 0;
  for (const block of blocks) {
    if (!block.startsWith("@font-face")) continue;
    const range = block.match(/unicode-range:\s*([^;]+);/)?.[1] ?? "";
    if (!range.includes("U+0000-00FF")) continue; // latin subset only
    const url = block.match(/src:\s*url\((https:\/\/[^)]+\.woff2)\)/)?.[1];
    if (!url) continue;
    const style = block.match(/font-style:\s*(\w+)/)?.[1] ?? "normal";
    const weight = block.match(/font-weight:\s*([\d. ]+)/)?.[1].trim() ?? "400";
    const fname = `${name}-${style}-${weight.replace(/\s+/g, "-")}.woff2`;
    const file = await fetch(url, { headers: { "User-Agent": UA } });
    if (!file.ok) throw new Error(`${fname}: ${file.status}`);
    await writeFile(outDir + fname, Buffer.from(await file.arrayBuffer()));
    css += `@font-face {
  font-family: '${name}';
  font-style: ${style};
  font-weight: ${weight.includes("..") ? weight : weight};
  font-display: swap;
  src: url('./assets/fonts/${fname}') format('woff2');
}
`;
    kept++;
  }
  console.log(`${name}: kept ${kept} latin faces`);
}

await writeFile(outDir + "fonts.css", css);
console.log("wrote fonts.css");
