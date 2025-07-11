import fs from "fs";
import os from "os";
import path from "path";
import { spawn } from "child_process";

export function generatePlatformChart(reportData, userId) {
  return new Promise((resolve, reject) => {
    const pythonScriptPath = path.resolve("generate_income_platform_chart.py");
    const tempDir = os.tmpdir(); // Pega o diretório temporário do sistema operacional
    
    const dataString = JSON.stringify(reportData);

    // Passamos os argumentos que o script Python espera agora
    const pythonProcess = spawn("python3", [pythonScriptPath, dataString, userId, tempDir]);

    let imageUrl = "";
    let errorOutput = "";

    pythonProcess.stdout.on("data", (data) => {
      // O script agora retorna a URL completa do Cloudinary
      imageUrl += data.toString().trim();
    });

    pythonProcess.stderr.on("data", (data) => {
      errorOutput += data.toString();
    });

    pythonProcess.on("close", (code) => {
      if (code !== 0) {
        console.error(`Erro no script Python (código ${code}):`, errorOutput);
        return reject(new Error("Falha ao gerar o gráfico de plataformas."));
      }
      if (!imageUrl) {
        return reject(new Error("URL da imagem não foi retornada pelo script Python."));
      }
      // Resolve com a URL segura do Cloudinary
      resolve(imageUrl);
    });
  });
}