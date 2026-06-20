from fastapi import FastAPI
from pydantic import BaseModel
import subprocess
import json
import time

app = FastAPI()

# -------------------------
# MODELOS
# -------------------------

class MineRequest(BaseModel):
    difficulty: str
    data: str
    start: int
    end: int

class Transaction(BaseModel):
    sender: str
    receiver: str
    amount: float

# -------------------------
# ESTADO LOCAL (simple)
# -------------------------

pending_transactions = []
blockchain = []

genesis = {
    "index": 0,
    "timestamp": time.time(),
    "transactions": [],
    "previous_hash": "0",
    "nonce": 0,
    "hash": "GENESIS"
}

blockchain.append(genesis)

# -------------------------
# GPU DETECTION ROBUSTA
# -------------------------

def get_gpu_name():
    try:
        result = subprocess.run(
            ["nvidia-smi", "--query-gpu=name", "--format=csv,noheader"],
            capture_output=True,
            text=True
        )
        return result.stdout.strip().lower()
    except Exception:
        return "unknown"


def select_binary(gpu_name: str):

    gpu_name = gpu_name.lower()

    if "rtx 40" in gpu_name or "4060" in gpu_name:
        return "./minero_sm89"

    if "rtx 30" in gpu_name or "3060" in gpu_name or "3050" in gpu_name:
        return "./minero_sm86"

    if "gtx 10" in gpu_name or "1050" in gpu_name or "1060" in gpu_name:
        return "./minero_sm61"

    # fallback seguro (evita crash)
    return "./minero_sm61"


def get_binary():
    gpu = get_gpu_name()
    return select_binary(gpu)

# -------------------------
# TRANSACCIONES
# -------------------------

@app.post("/transaction")
def add_transaction(tx: Transaction):
    pending_transactions.append(tx.dict())
    return {
        "status": "stored",
        "count": len(pending_transactions)
    }

# -------------------------
# MINERÍA DIRECTA
# -------------------------

@app.post("/mine")
def mine(req: MineRequest):

    binary = get_binary()

    result = subprocess.run(
        [
            binary,
            req.data,
            req.difficulty,
            str(req.start),
            str(req.end)
        ],
        capture_output=True,
        text=True
    )

    return {"result": result.stdout}

# -------------------------
# CREACIÓN DE BLOQUES
# -------------------------

@app.post("/create-block")
def create_block():

    if len(pending_transactions) == 0:
        return {"error": "No hay transacciones pendientes"}

    previous_hash = blockchain[-1]["hash"]

    block = {
        "index": len(blockchain),
        "timestamp": time.time(),
        "transactions": pending_transactions.copy(),
        "previous_hash": previous_hash
    }

    data = json.dumps(block, sort_keys=True)

    binary = get_binary()

    result = subprocess.run(
        [
            binary,
            data,
            "00",
            "0",
            "1000000"
        ],
        capture_output=True,
        text=True
    )

    print(result.stdout)
    print(result.stderr)

    nonce = None
    block_hash = None

    for line in result.stdout.splitlines():
        if line.startswith("Nonce encontrado:"):
            nonce = int(line.split(":")[1].strip())
        if line.startswith("Hash resultante:"):
            block_hash = line.split(":")[1].strip()

    if nonce is None or block_hash is None:
        return {"error": "No se encontró solución"}

    block["nonce"] = nonce
    block["hash"] = block_hash

    blockchain.append(block)
    pending_transactions.clear()

    return {
        "message": "Bloque agregado",
        "block": block
    }

# -------------------------
# CONSULTA BLOCKCHAIN
# -------------------------

@app.get("/chain")
def get_chain():
    return {
        "length": len(blockchain),
        "chain": blockchain
    }

# -------------------------
# VALIDACIÓN
# -------------------------

@app.get("/validate")
def validate_chain():

    for i in range(1, len(blockchain)):
        current = blockchain[i]
        previous = blockchain[i - 1]

        if current["previous_hash"] != previous["hash"]:
            return {
                "valid": False,
                "block": i
            }

    return {"valid": True}