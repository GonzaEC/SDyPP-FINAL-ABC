import pika
import json
import time
import redis
import threading
import math
import urllib.request
import ssl

# TRP (Pool de Transacciones) es un intermediario inteligente entre el NCT y los workers. 
# El NCT dice "minà este bloque", y el TrP se encarga de dividir ese trabajo, distribuirlo, y decidir si hay que cambiar de modo GPU a CPU.

# -------------------------
# CONEXIONES
# -------------------------

def connect_redis():
    while True:
        try:
            r = redis.Redis(host="redis", port=6379, decode_responses=True)
            r.ping()
            return r
        except Exception:
            time.sleep(3)

def connect_rabbitmq():
    while True:
        try:
            conn = pika.BlockingConnection(pika.ConnectionParameters("rabbitmq"))
            return conn
        except Exception:
            time.sleep(3)

r = connect_redis()
connection = connect_rabbitmq()
channel = connection.channel()
channel.queue_declare(queue='tareas_pool')   # NCT → TrP
channel.queue_declare(queue='tareas')        # TrP → Workers
channel.queue_declare(queue='soluciones')

# -------------------------
# MONITOREO DE GPU
# -------------------------

FALLBACK_DIFFICULTY = "0"    # dificultad reducida para CPU
ORIGINAL_DIFFICULTY_KEY = "difficulty_original"
CPU_WORKER_REPLICAS = 2     # réplicas de worker-cpu en modo fallback


def scale_cpu_workers(replicas: int):
    """Escala el deployment de worker-cpu usando la API de Kubernetes in-cluster."""
    try:
        token_path = "/var/run/secrets/kubernetes.io/serviceaccount/token"
        ca_path = "/var/run/secrets/kubernetes.io/serviceaccount/ca.crt"
        with open(token_path) as f:
            token = f.read().strip()
        url = (
            "https://kubernetes.default.svc/apis/apps/v1"
            "/namespaces/sdypp/deployments/blockchain-worker-cpu/scale"
        )
        patch = json.dumps({"spec": {"replicas": replicas}}).encode()
        ctx = ssl.create_default_context(cafile=ca_path)
        req = urllib.request.Request(
            url, data=patch, method="PATCH",
            headers={
                "Authorization": f"Bearer {token}",
                "Content-Type": "application/merge-patch+json",
            },
        )
        urllib.request.urlopen(req, context=ctx, timeout=10)
        print(f"[TrP] worker-cpu escalado a {replicas} réplicas")
    except Exception as e:
        print(f"[TrP] Error escalando worker-cpu: {e}")

# Verificamos si el gpu-server sigue vivo chequeando su heartbeat en Redis.
def is_gpu_server_alive() -> bool:
    return r.exists("heartbeat:gpu-server") == 1


# Esta funcion corre en background. Cada 15s revisa si el gpu-server sigue vivo.
# Si no responde: reduce la dificultad y dispara el fallback CPU en la nube (GCP).
# Si vuelve: restaura la dificultad y destruye las instancias CPU que ya no hacen falta.
def monitor_loop():
    in_fallback = False

    while True:
        gpu_alive = is_gpu_server_alive()

        if not gpu_alive and not in_fallback:
            print("[TrP] gpu-server no responde — activando fallback CPU")

            original = r.get("difficulty")
            if original:
                r.set(ORIGINAL_DIFFICULTY_KEY, original)
            r.set("difficulty", FALLBACK_DIFFICULTY)

            scale_cpu_workers(CPU_WORKER_REPLICAS)

            in_fallback = True

        elif gpu_alive and in_fallback:
            print("[TrP] gpu-server activo de nuevo — restaurando modo GPU")

            original = r.get(ORIGINAL_DIFFICULTY_KEY)
            if original:
                r.set("difficulty", original)

            scale_cpu_workers(0)

            in_fallback = False

        time.sleep(15)

threading.Thread(target=monitor_loop, daemon=True).start()

# -------------------------
# SUBDIVISION DE TAREAS
# -------------------------

TOTAL       = 10_000_000
CHUNK_SIZE  = 2_500_000   # cada sub-tarea cubre este rango


# Recibe una tarea del NCT con start/end opcionales,
# la fragmenta en chunks y publica cada uno en 'tareas'.
# Cada chunk se publica como un mensaje separado en [tareas]. RabbitMQ los distribuye entre los workers disponibles automáticamente
def subdivide_and_publish(tarea: dict):
    start      = tarea.get("start", 0)
    end        = tarea.get("end", TOTAL)
    difficulty = tarea.get("difficulty", r.get("difficulty"))
    data       = tarea["data"]

    total_range = end - start
    n_chunks    = math.ceil(total_range / CHUNK_SIZE)

    print(f"[TrP] Subdiviendo tarea en {n_chunks} chunks (dificultad: {difficulty})")

    for i in range(n_chunks):
        chunk_start = start + i * CHUNK_SIZE
        chunk_end   = min(chunk_start + CHUNK_SIZE - 1, end)

        subtarea = {
            "difficulty": difficulty,
            "data":       data,
            "start":      chunk_start,
            "end":        chunk_end
        }

        channel.basic_publish(
            exchange='',
            routing_key='tareas',
            body=json.dumps(subtarea)
        )

    r.rpush("logs", json.dumps({
        "timestamp": time.time(),
        "event":     "trp_subdividio_tarea",
        "chunks":    n_chunks,
        "difficulty": difficulty
    }))

# -------------------------
# CONSUMER: tareas_pool
# -------------------------

def on_task(ch, method, properties, body):
    tarea = json.loads(body)
    subdivide_and_publish(tarea)

channel.basic_consume(queue='tareas_pool', on_message_callback=on_task, auto_ack=True)
print("[TrP] Esperando tareas del NCT...")
channel.start_consuming()