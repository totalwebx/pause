// index.js
const express = require("express");
const fs = require("fs");
const path = require("path");

const app = express();
const PORT = process.env.PORT || 3000;

// --------- Chemins vers les fichiers JSON ----------
const employeesPath = path.join(__dirname, "employees.json");
const pausesPath = path.join(__dirname, "pauses.json");

// --------- Middlewares ----------
app.use(express.json());
app.use(express.static(path.join(__dirname, "public"))); // pour servir index.html

// Helper pour lire JSON
function readJson(filePath) {
  return new Promise((resolve, reject) => {
    fs.readFile(filePath, "utf8", (err, data) => {
      if (err) return reject(err);
      try {
        const parsed = JSON.parse(data || "{}");
        resolve(parsed);
      } catch (e) {
        reject(e);
      }
    });
  });
}

// Helper pour écrire JSON
function writeJson(filePath, obj) {
  return new Promise((resolve, reject) => {
    fs.writeFile(filePath, JSON.stringify(obj, null, 2), "utf8", (err) => {
      if (err) return reject(err);
      resolve();
    });
  });
}

// --------- API: pointer / dépointer la pause ----------
app.post("/api/pause", async (req, res) => {
  try {
    const { matricule } = req.body;

    // 1) Vérif format
    if (!matricule || !/^\d{4}$/.test(matricule)) {
      return res.status(400).json({
        error: "Matricule invalide. Il doit contenir exactement 4 chiffres.",
      });
    }

    // 2) Vérif que le matricule existe dans employees.json
    const employees = await readJson(employeesPath);
    const employee = employees.find((e) => e.matricule === matricule);

    if (!employee) {
      return res.status(400).json({
        error: "Matricule inconnu. Pause refusée.",
      });
    }

    // 3) Charger pauses.json
    let pauses;
    try {
      pauses = await readJson(pausesPath);
    } catch (e) {
      // Si le fichier n'existe pas ou est vide
      pauses = { active: {}, history: [] };
    }

    if (!pauses.active) pauses.active = {};
    if (!pauses.history) pauses.history = [];

    const now = new Date();

    // 4) Si pas encore en pause → démarrer la pause
    if (!pauses.active[matricule]) {
      pauses.active[matricule] = now.toISOString();
      await writeJson(pausesPath, pauses);

      return res.json({
        status: "start",
        message: `Pause démarrée pour ${employee.name} (${matricule})`,
        employee,
        startTime: pauses.active[matricule],
      });
    }

    // 5) Sinon → fin de pause
    const startTime = new Date(pauses.active[matricule]);
    const endTime = now;
    const diffMs = endTime - startTime;
    const durationMinutes = Math.round(diffMs / 60000);

    const over20 = durationMinutes > 20;

    // Enregistrer dans l'historique
    const record = {
      matricule,
      name: employee.name,
      start: startTime.toISOString(),
      end: endTime.toISOString(),
      durationMinutes,
      statusColor: over20 ? "red" : "green",
    };

    pauses.history.unshift(record); // on met en début de tableau
    delete pauses.active[matricule];

    await writeJson(pausesPath, pauses);

    return res.json({
      status: "end",
      message: `Pause terminée pour ${employee.name} (${matricule})`,
      employee,
      startTime: record.start,
      endTime: record.end,
      durationMinutes,
      over20,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Erreur serveur" });
  }
});

// --------- API: récupérer l'historique ----------
app.get("/api/history", async (req, res) => {
  try {
    const pauses = await readJson(pausesPath);
    res.json(pauses.history || []);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Erreur lors de la lecture de l'historique" });
  }
});

// --------- Lancer le serveur en local ----------
app.listen(PORT, () => {
  console.log(`Pause app running on http://localhost:${PORT}`);
});

// Pour Vercel (optionnel) :
// module.exports = app;


// Lancer le serveur seulement en local
if (process.env.NODE_ENV !== "production") {
  app.listen(PORT, () => {
    console.log(`Pause app running on http://localhost:${PORT}`);
  });
}

// Export pour Vercel
module.exports = app;
