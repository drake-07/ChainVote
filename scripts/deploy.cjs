const hre = require("hardhat");
const fs = require("fs");
const path = require("path");

async function main() {
  const Voting = await hre.ethers.getContractFactory("Voting");
  const voting = await Voting.deploy();
  await voting.deployed();

  console.log("🚀 Contrato inteligente Voting desplegado con éxito!");
  console.log("📍 Dirección del contrato:", voting.address);

  // ====== 🤖 AUTOMATIZACIÓN DE LA DIRECCIÓN ======
  // Definimos la ruta donde queremos guardar la dirección dentro del frontend
  const contradosDir = path.join(__dirname, "..", "src", "contracts");
  
  // Si la carpeta src/contracts no existe en tu React, la creamos de forma automática
  if (!fs.existsSync(contradosDir)) {
    fs.mkdirSync(contradosDir, { recursive: true });
  }

  // Guardamos un archivo JSON con la dirección del contrato
  fs.writeFileSync(
    path.join(contradosDir, "contract-address.json"),
    JSON.stringify({ Voting: voting.address }, null, 2)
  );

  console.log("💾 ¡Dirección del contrato guardada automáticamente en el frontend!");
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });