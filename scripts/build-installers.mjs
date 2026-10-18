// Build the 64-bit and 32-bit Windows installers and copy them, clearly
// named, into installers/. Needs the Rust target: rustup target add i686-pc-windows-msvc
// Run with: npm run installers

import { execSync } from "node:child_process";
import { copyFileSync, mkdirSync, readFileSync } from "node:fs";

const version = JSON.parse(readFileSync("src-tauri/tauri.conf.json", "utf8")).version;
const run = (cmd) => execSync(cmd, { stdio: "inherit" });

run("npx tauri build");
run("npx tauri build --target i686-pc-windows-msvc");

mkdirSync("installers", { recursive: true });
const copy = (from, to) => {
  copyFileSync(from, `installers/${to}`);
  console.log(`installers/${to}`);
};
copy(`src-tauri/target/release/bundle/nsis/Lorewright_${version}_x64-setup.exe`, `Lorewright_${version}_64-bit_setup.exe`);
copy(`src-tauri/target/release/bundle/msi/Lorewright_${version}_x64_en-US.msi`, `Lorewright_${version}_64-bit.msi`);
copy(`src-tauri/target/i686-pc-windows-msvc/release/bundle/nsis/Lorewright_${version}_x86-setup.exe`, `Lorewright_${version}_32-bit_setup.exe`);
copy(`src-tauri/target/i686-pc-windows-msvc/release/bundle/msi/Lorewright_${version}_x86_en-US.msi`, `Lorewright_${version}_32-bit.msi`);
