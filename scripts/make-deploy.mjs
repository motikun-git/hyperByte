// Builds the folder you upload to your hosting: deploy/public_html
// Run from the client folder:  npm.cmd run deploy   (Windows)  or  npm run deploy
//
// Result:
//   deploy/public_html/index.php, .htaccess, index.html, assets/, fonts/, hero/  (the website)
//   deploy/public_html/api/        (the PHP API, without your .env or local data)
//   deploy/public_html/uploads/    (empty; product photos are saved here on the server)
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const dist = path.join(root, "client", "dist");
const out = path.join(root, "deploy", "public_html");

if (!fs.existsSync(path.join(dist, "index.html"))) {
  console.error("client/dist is missing. Run the build first (npm run build in the client folder).");
  process.exit(1);
}

fs.rmSync(path.join(root, "deploy"), { recursive: true, force: true });
fs.mkdirSync(out, { recursive: true });

// 1. The built website
fs.cpSync(dist, out, { recursive: true });

// 2. The page server and the Apache rules
fs.copyFileSync(path.join(root, "site", "index.php"), path.join(out, "index.php"));
fs.copyFileSync(path.join(root, "site", ".htaccess"), path.join(out, ".htaccess"));
fs.mkdirSync(path.join(out, "assets"), { recursive: true });
fs.copyFileSync(path.join(root, "site", "assets.htaccess"), path.join(out, "assets", ".htaccess"));

// 3. The API, without secrets, local data or tests
const skip = (rel) => {
  const p = rel.split(path.sep).join("/");
  return (
    p === ".env" ||
    p.startsWith("tests") ||
    /^storage\/(sessions|logs)\/(?!\.gitkeep$)/.test(p) ||
    /^storage\/archive(\/|$)/.test(p) ||
    /^storage\/(schema-version|migrate\.lock)$/.test(p) ||
    /^storage\/.*\.sqlite/.test(p)
  );
};
const apiSrc = path.join(root, "api");
fs.cpSync(apiSrc, path.join(out, "api"), {
  recursive: true,
  filter: (src) => {
    const rel = path.relative(apiSrc, src);
    return rel === "" || !skip(rel);
  },
});
for (const dir of ["sessions", "logs"]) {
  fs.mkdirSync(path.join(out, "api", "storage", dir), { recursive: true });
}

// 4. The photo folder (only images may be served from it)
fs.mkdirSync(path.join(out, "uploads"), { recursive: true });
fs.copyFileSync(path.join(root, "site", "uploads.htaccess"), path.join(out, "uploads", ".htaccess"));

console.log("\nReady: " + out);
console.log("Upload everything inside public_html to your hosting's public_html folder.");
console.log("Then create api/.env on the server (copy api/.env.example) with your database details.");
console.log("Tip (Windows): right-click the public_html folder > Send to > Compressed (zipped) folder, upload the zip in cPanel File Manager and Extract it.\n");
