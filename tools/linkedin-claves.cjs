/** Guarda Client ID y Client Secret de la app de LinkedIn como secretos de Firebase. Nunca los muestra. */
const { execFileSync } = require("node:child_process");
const readline = require("node:readline/promises");

const guardar = (nombre, valor) =>
  execFileSync(`npx --yes firebase-tools functions:secrets:set ${nombre} --data-file -`, { input: valor, stdio: ["pipe", "inherit", "inherit"], shell: true });

(async () => {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  console.log('Datos de la app "Mariela Redes" en LinkedIn (pestana Auth).\n');
  const id = (await rl.question("1) Client ID: ")).trim();
  const secret = (await rl.question("2) Client Secret: ")).trim();
  rl.close();
  if (!id || !secret) throw new Error("Falta alguno de los dos datos.");
  console.log("\nGuardando...");
  guardar("LINKEDIN_CLIENT_ID", id);
  guardar("LINKEDIN_CLIENT_SECRET", secret);
  console.log("\nListo. Ahora corre Publicar leads.bat");
})().catch((e) => {
  console.error(`\nERROR: ${e.message}`);
  process.exitCode = 1;
});
