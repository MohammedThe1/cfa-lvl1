import { readFile } from "node:fs/promises";
import { validateBank } from "../src/model.js";
try {
  const bank = JSON.parse(await readFile(process.argv[2], "utf8"));
  const errors = validateBank(bank);
  if (errors.length) throw Error(errors.join("\n"));
  console.log(
    `${bank.questions.length} records structurally valid. Source accuracy still requires independent page review and user approval.`,
  );
} catch (e) {
  console.error(e.message);
  process.exitCode = 1;
}
