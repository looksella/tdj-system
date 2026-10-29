import { createClient } from "@supabase/supabase-js";
import { createInterface } from "node:readline";
import { stdin, stdout } from "node:process";

const role = process.argv[2];
if (role !== "admin" && role !== "developer") {
  throw new Error("Indica un rol válido: admin o developer.");
}

function ask(prompt) {
  return new Promise((resolve, reject) => {
    const readline = createInterface({ input: stdin, output: stdout });
    readline.question(prompt, (answer) => {
      readline.close();
      resolve(answer.trim());
    });
    readline.on("error", reject);
  });
}

function askSecret(prompt) {
  if (!stdin.isTTY || typeof stdin.setRawMode !== "function") {
    throw new Error("Ejecuta este comando desde una terminal interactiva.");
  }

  return new Promise((resolve, reject) => {
    let value = "";
    stdout.write(prompt);
    stdin.setRawMode(true);
    stdin.resume();

    function finish(error) {
      stdin.removeListener("data", onData);
      stdin.setRawMode(false);
      stdin.pause();
      stdout.write("\n");
      if (error) reject(error);
      else resolve(value);
    }

    function onData(chunk) {
      for (const character of chunk.toString()) {
        if (character === "\u0003") {
          finish(new Error("Operación cancelada."));
          return;
        }
        if (character === "\r" || character === "\n") {
          finish();
          return;
        }
        if (character === "\u007f" || character === "\b") {
          value = value.slice(0, -1);
        } else {
          value += character;
        }
      }
    }

    stdin.on("data", onData);
  });
}

async function main() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) {
    throw new Error(
      "Configura NEXT_PUBLIC_SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY en .env.",
    );
  }

  const supabase = createClient(url, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  if (role === "developer") {
    for (let page = 1; page <= 100; page++) {
      const { data, error } = await supabase.auth.admin.listUsers({
        page,
        perPage: 200,
      });
      if (error) {
        throw new Error(`No se pudo verificar la cuenta desarrolladora: ${error.message}`);
      }
      if (data.users.some((user) => user.app_metadata?.role === "developer")) {
        throw new Error("Ya existe una cuenta de desarrolladora; no se creará otra.");
      }
      if (data.users.length === 0) break;
      if (page === 100) {
        throw new Error("No se pudo comprobar que no exista otra cuenta desarrolladora.");
      }
    }
  }

  const email = await ask("Correo de la cuenta: ");
  const password = await askSecret("Contraseña (mínimo 8 caracteres): ");
  if (!email || !email.includes("@")) {
    throw new Error("Ingresa una dirección de correo válida.");
  }
  if (password.length < 8) {
    throw new Error("La contraseña debe tener al menos 8 caracteres.");
  }

  const { data, error } = await supabase.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    app_metadata: { role },
    user_metadata: { activado_at: new Date().toISOString() },
  });
  if (error) {
    throw new Error(`No se pudo crear la cuenta: ${error.message}`);
  }

  console.log(`Cuenta ${role} creada: ${data.user.email}`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
