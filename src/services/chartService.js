import fs from "fs";
import path from "path";
import { spawn } from "child_process";

// MUDANÇA: Função única e nova para gerar gráficos de lucratividade.
export async function generateProfitChart(reportData, userId) {
  return new Promise((resolve, reject) => {
    // A lógica de sanitização e caminhos é mantida.
    const sanitizedUserId = userId.replace(/[^a-zA-Z0-9]/g, "_");
    const tempFilePath = path.join("/tmp", `profit_data_${sanitizedUserId}.json`);
    const outputImagePath = path.join("/tmp", `profit_chart_${sanitizedUserId}.png`);

    fs.writeFileSync(tempFilePath, JSON.stringify(reportData, null, 2));

    if (!fs.existsSync(tempFilePath)) {
      const errorMsg = "Erro: O JSON de lucratividade não foi salvo corretamente.";
      console.error(errorMsg);
      return reject(errorMsg);
    }

    const pythonCommand = process.platform === "win32" ? "python" : "python3";
    
    // MUDANÇA: Chama o novo script Python que criaremos a seguir.
    const script = spawn(pythonCommand, [
      "generate_profit_chart.py",
      tempFilePath,
      outputImagePath,
    ]);

    let imageUrl = "";
    let errorOutput = "";

    script.stdout.on("data", (data) => {
      const output = data.toString().trim();
      console.log("📤 Saída do Python (Profit Chart):", output);
      if (output.startsWith("http")) {
        imageUrl = output;
      }
    });

    script.stderr.on("data", (data) => {
      errorOutput += data.toString();
      console.error("❌ Erro do Python (Profit Chart):", data.toString());
    });

    script.on("exit", (code) => {
      console.log("🚪 Script de gráfico de lucro finalizado com código:", code);
      if (fs.existsSync(tempFilePath)) {
        fs.unlinkSync(tempFilePath);
      }

      if (code === 0 && imageUrl) {
        resolve(imageUrl);
      } else {
        reject("Erro ao gerar o gráfico de lucratividade.\n" + errorOutput);
      }
    });
  });
}