from fastapi import FastAPI
from pydantic import BaseModel
from contextlib import asynccontextmanager

import pika
import json
import time
import redis

app = FastAPI()

# ---------------- REDIS ----------------

r = redis.Redis(
    host="redis",
    port=6379,
    decode_responses=True
)

# ---------------- CONFIGURACION ----------------

TOTAL = 1000000

WORKERS = 4

rango = TOTAL // WORKERS


print("Conectando a Redis y verificando bloque Génesis...")
while True:
    try:
        # Intentamos una operación básica para ver si Redis responde
        if r.llen("blockchain") == 0:
            genesis = {
                    "index": 0,
                    "timestamp": time.time(),
                    "transactions": [],
                    "previous_hash": "0",
                    "nonce": 0,
                    "hash": "GENESIS"
            }
            r.rpush("blockchain", json.dumps(genesis))
            print("¡Bloque génesis verificado/creado con éxito!")
        break # Si todo salió bien, rompe el bucle y arranca FastAPI
    except redis.exceptions.ConnectionError:
        print("Redis no está listo todavía. Reintentando en 3 segundos...")
        time.sleep(3)
            
   
# ---------------- MODELO ----------------

class Transaction(BaseModel):

    sender: str

    receiver: str

    amount: float

# ---------------- TRANSACCIONES ----------------

@app.post("/transaction")

def transaction(tx: Transaction):

    transaccion = tx.dict()

    r.rpush(

        "pending_transactions",

        json.dumps(transaccion)

    )

    evento = {

        "timestamp": time.time(),

        "event": "transaccion_recibida",

        "data": transaccion

    }

    r.rpush(

        "logs",

        json.dumps(evento)

    )

    return {"ok": True}

# ---------------- CREAR BLOQUE ----------------

@app.post("/create-block")
def create_block():

    connection = pika.BlockingConnection(
        pika.ConnectionParameters("rabbitmq")
    )

    channel = connection.channel()

    try:

        channel.queue_declare(queue="tareas")
        channel.queue_declare(queue="soluciones")

        # Obtener transacciones pendientes desde Redis
        pending_transactions = r.lrange(
            "pending_transactions",
            0,
            -1
        )

        if len(pending_transactions) == 0:
            return {"error": "sin transacciones"}

        pending_transactions = [
            json.loads(tx)
            for tx in pending_transactions
        ]

        # Obtener último bloque
        ultimo_bloque = r.lindex(
            "blockchain",
            -1
        )

        if ultimo_bloque is None:
            return {"error": "no existe bloque génesis"}

        ultimo_bloque = json.loads(
            ultimo_bloque
        )

        cantidad_bloques = r.llen(
            "blockchain"
        )

        block = {
            "index": cantidad_bloques,
            "timestamp": time.time(),
            "transactions": pending_transactions,
            "previous_hash": ultimo_bloque["hash"]
        }

        try:
            channel.queue_purge(
                queue="soluciones"
            )
        except Exception:
            pass

        for i in range(WORKERS):

            inicio = i * rango

            if i == WORKERS - 1:
                fin = TOTAL
            else:
                fin = (i + 1) * rango - 1

            tarea = {
                "difficulty": "00",
                "data": json.dumps(block),
                "start": inicio,
                "end": fin
            }

            channel.basic_publish(
                exchange="",
                routing_key="tareas",
                body=json.dumps(tarea)
            )

        timeout = 120
        inicio_espera = time.time()
        body = None

        while body is None:

            if time.time() - inicio_espera > timeout:
                return {
                    "error": "timeout esperando solución"
                }

            method, properties, body = channel.basic_get(
                queue="soluciones",
                auto_ack=True
            )

            if body is None:
                time.sleep(0.5)

        solucion = json.loads(body)

        block["nonce"] = solucion["nonce"]
        block["hash"] = solucion["hash"]

        # Guardar bloque en Redis
        r.rpush(
            "blockchain",
            json.dumps(block)
        )

        # Vaciar transacciones pendientes
        r.delete(
            "pending_transactions"
        )

        try:
            channel.queue_purge(
                queue="soluciones"
            )
        except Exception:
            pass

        return block

    finally:

        if connection.is_open:
            connection.close()

# ---------------- VALIDAR ----------------

@app.get("/validate")

def validate():

    bloques = r.lrange(

        "blockchain",

        0,

        -1

    )

    bloques = [

        json.loads(x)

        for x in bloques

    ]

    for i in range(1, len(bloques)):

        actual = bloques[i]

        previo = bloques[i - 1]

        if actual["previous_hash"] != previo["hash"]:

            return {

                "valid": False

            }

    return {

        "valid": True

    }

# ---------------- BLOCKCHAIN ----------------

@app.get("/blockchain")

def get_blockchain():

    bloques = r.lrange(

        "blockchain",

        0,

        -1

    )

    return {

        "total_bloques": len(bloques),

        "blockchain": [

            json.loads(x)

            for x in bloques

        ]

    }