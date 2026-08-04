#!/usr/bin/env python3
"""Arnés de carga parametrizable para el NCT (blockchain).

Genera N transacciones (mint) con firma ECDSA real contra el NCT y mide los
tiempos del flujo completo: submitted -> pending -> CONFIRMED (bloque minado).

Uso (con el compose raíz levantado):

  # 1000 transacciones, default dificultad actual del NCT
  python Pilar2/P5/loadtest.py --tx 1000

  # Bulk especifico + barrer dificultad con workers ya escalados manualmente:
  #   docker compose up --scale worker-cpu=4 -d
  python Pilar2/P5/loadtest.py --tx 100 --batch 100 --difficulty 00

La "fragmentación del pool" se barre con la env del TrP TRP_CHUNK_SIZE
(p. ej. 2500 para 0.025% vs 250000 para 2.5%). El arnés NO redirige el TrP:
lanza el mismo NCT y deja el chunk como este configurado.

Salida: por cada tx su time-to-confirm; al final promedios/percentiles y un CSV
en el cwd (si --csv) con los datos crudos para el informe (§4/§7).
"""
import argparse
import base64
import csv
import json
import os
import statistics
import sys
import time
import urllib.request

from cryptography.hazmat.primitives.asymmetric import ec
from cryptography.hazmat.primitives import hashes, serialization
from cryptography.hazmat.primitives.asymmetric.utils import decode_dss_signature


def canonicalize(value):
    """Espejo del canonicalize del NCT/TS (keys ordenadas, sin espacios)."""
    if value is None or isinstance(value, (bool, int, float, str)):
        return json.dumps(value, ensure_ascii=False, separators=(",", ":"))
    if isinstance(value, list):
        return "[" + ",".join(canonicalize(v) for v in value) + "]"
    if isinstance(value, dict):
        keys = sorted(value.keys())
        return "{" + ",".join(json.dumps(k) + ":" + canonicalize(value[k]) for k in keys) + "}"
    raise ValueError(type(value))


def sign_p1363(priv, message_bytes):
    der = priv.sign(message_bytes, ec.ECDSA(hashes.SHA256()))
    r, s = decode_dss_signature(der)
    return r.to_bytes(32, "big") + s.to_bytes(32, "big")


def _spki_b64(pub):
    der = pub.public_bytes(
        encoding=serialization.Encoding.DER,
        format=serialization.PublicFormat.SubjectPublicKeyInfo,
    )
    return base64.b64encode(der).decode()


class HttpError(Exception):
    pass


def http_json(url, method="GET", payload=None, timeout=30):
    data = json.dumps(payload).encode() if payload is not None else None
    req = urllib.request.Request(url, data=data, method=method)
    if payload is not None:
        req.add_header("Content-Type", "application/json")
    try:
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            return resp.status, json.loads(resp.read().decode())
    except urllib.error.HTTPError as e:
        raise HttpError(f"{e.code} {e.read().decode()}")


def wait_confirmed(base, op_id, timeout=120):
    deadline = time.time() + timeout
    while time.time() < deadline:
        _, op = http_json(f"{base}/ops/{op_id}")
        if op.get("status") == "CONFIRMED":
            return op
        if op.get("status") == "FAILED":
            return op
        time.sleep(0.2)
    return None


def main():
    ap = argparse.ArgumentParser(description="Arnés de carga NCT")
    ap.add_argument("--base", default=os.getenv("NCT_URL", "http://localhost:8000"))
    ap.add_argument("--tx", type=int, default=100, help="total de transacciones a emitir")
    ap.add_argument("--batch", type=int, default=50, help="tx por lote (espera confirmación de cada lote antes de seguir)")
    ap.add_argument("--difficulty", default=None, help="dificultad opcional (cadena de ceros). Si no, usa la del NCT")
    ap.add_argument("--ticket-count", default=5, type=int, help="tickets por evento (barato, no pesa en el minado)")
    ap.add_argument("--csv", default=None, help="ruta CSV para guardar resultados crudos")
    ap.add_argument("--quiet", action="store_true")
    args = ap.parse_args()

    base = args.base.rstrip("/")
    results = []

    # La dificultad se indica como cantidad de ceros (--difficulty 2 == "00"),
    # o directamente como string de ceros si ya viene en ese formato.
    if args.difficulty is not None:
        if args.difficulty.isdigit() and not args.difficulty.startswith("0"):
            difficulty_value = "0" * int(args.difficulty)
        else:
            difficulty_value = args.difficulty
    else:
        difficulty_value = None

    # Identidad del organizador para firmar los mints.
    priv = ec.generate_private_key(ec.SECP256R1())
    pub_b64 = _spki_b64(priv.public_key())

    if difficulty_value:
        http_json(f"{base}/difficulty", method="POST", payload={"difficulty": difficulty_value})

    _, diff = http_json(f"{base}/difficulty")
    difficulty = difficulty_value or (diff or {}).get("difficulty", "")
    if not args.quiet:
        print(f"base={base} tx={args.tx} batch={args.batch} difficulty={difficulty!r}")

    def emit_one(idx):
        event_id = f"load_{idx}_{int(time.time())}"
        payload = {
            "type": "mint_batch",
            "eventId": event_id,
            "organizerPublicKey": pub_b64,
            "ticketCount": args.ticket_count,
            "issuedAt": time.time(),
        }
        sig = sign_p1363(priv, canonicalize(payload).encode("utf-8"))
        body = {
            "event_id": event_id,
            "organizer_pubkey": pub_b64,
            "ticket_count": args.ticket_count,
            "signed_payload": payload,
            "signature": base64.b64encode(sig).decode(),
        }
        t0 = time.time()
        _, resp = http_json(f"{base}/tx/mint", method="POST", payload=body)
        return t0, resp

    t_batch_start = time.time()
    emitted = 0
    op_ids = []
    while emitted < args.tx:
        # Emitir un lote en paralelo (no secuencial: el auto-miner junta las
        # pendientes en un solo bloque, así que esperarlas de a una subestima
        # el throughput real).
        batch = []
        for i in range(min(args.batch, args.tx - emitted)):
            t0, resp = emit_one(emitted + i)
            batch.append((t0, resp))
            emitted += 1
        op_ids = [(t0, r["op_id"]) for t0, r in batch]

        # Esperar la confirmación del lote (un solo bloque con todas).
        for t0, op_id in op_ids:
            op = wait_confirmed(base, op_id)
            t1 = time.time()
            status = op.get("status") if op else "TIMEOUT"
            results.append({"batch": len(results), "op_id": op_id, "status": status,
                            "ttc_s": round(t1 - t0, 3)})
            if not args.quiet:
                print(f"  op={op_id} {status} ttc={t1 - t0:.2f}s")

    total = time.time() - t_batch_start
    ttcs = [r["ttc_s"] for r in results]
    ok = [r for r in results if r["status"] == "CONFIRMED"]

    print(f"\n== Resumen ==")
    print(f"txs={len(results)} confirmed={len(ok)} total_elapsed={total:.1f}s "
          f"avg_ttc={statistics.mean(ttcs):.2f}s p50={statistics.median(ttcs):.2f}s "
          f"p95={sorted(ttcs)[int(len(ttcs)*0.95)-1]:.2f}s" if ttcs else "sin datos")

    if args.csv:
        with open(args.csv, "w", newline="") as f:
            w = csv.DictWriter(f, fieldnames=["batch", "op_id", "status", "ttc_s", "difficulty"])
            w.writeheader()
            for r in results:
                r["difficulty"] = difficulty
                w.writerow(r)
        if not args.quiet:
            print(f"CSV -> {args.csv}")


if __name__ == "__main__":
    main()