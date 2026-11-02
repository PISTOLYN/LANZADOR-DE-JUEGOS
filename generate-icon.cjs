const fs = require("fs");
const path = require("path");
const sharp = require("sharp");
const pngToIco = require("png-to-ico");

(async () => {
  const root = __dirname;
  const svgPath = path.join(root, "assets", "bola-roja.svg");
  const pngPath = path.join(root, "assets", "bola-roja.png");
  const icoPath = path.join(root, "assets", "icon.ico");
  await sharp(svgPath).resize(256, 256).png().toFile(pngPath);
  const ico = await pngToIco(pngPath);
  fs.writeFileSync(icoPath, ico);
  console.log("Ícono de bola roja generado:", icoPath);
})().catch(error => { console.error(error); process.exit(1); });
