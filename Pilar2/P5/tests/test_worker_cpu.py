"""Tests de mine_cpu(): el nucleo de minado del worker CPU.

El caso importante es `test_mine_cpu_propaga_excepciones`, que cubre una
regresion concreta: mine_cpu envolvia el bucle en `try/except Exception: pass`,
asi que cualquier falla real se devolvia como (None, None) — indistinguible de
"no habia solucion en este rango". El callback entonces ackeaba la tarea como
completada: sin nack, sin reintento y sin rastro. Ahora el conteo de hashes va
en un `finally` y la excepcion se propaga.
"""
import hashlib

import pytest
from prometheus_client import REGISTRY


def _hashes_registrados():
    """Valor actual de worker_hashes_total{worker_type="cpu"}."""
    valor = REGISTRY.get_sample_value("worker_hashes_total", {"worker_type": "cpu"})
    return valor or 0.0


def test_mine_cpu_encuentra_solucion_en_rango(worker_cpu):
    # Buscamos el primer nonce cuyo MD5 de "test<nonce>" empiece con "0".
    esperado = next(
        n for n in range(0, 10_000)
        if hashlib.md5(f"test{n}".encode()).hexdigest().startswith("0")
    )

    nonce, h = worker_cpu.mine_cpu("test", "0", 0, 10_000)

    assert nonce == esperado
    assert h.startswith("0")
    # El hash devuelto tiene que corresponder al nonce devuelto.
    assert h == hashlib.md5(f"test{nonce}".encode()).hexdigest()


def test_mine_cpu_sin_solucion_devuelve_none(worker_cpu):
    # Un prefijo imposible de alcanzar en un rango tan chico.
    nonce, h = worker_cpu.mine_cpu("test", "fffffff", 0, 50)

    assert nonce is None
    assert h is None


def test_mine_cpu_cuenta_los_hashes_del_rango_agotado(worker_cpu):
    antes = _hashes_registrados()

    # 0..49 inclusive = 50 iteraciones (el bucle es range(start, end + 1)).
    worker_cpu.mine_cpu("test", "fffffff", 0, 49)

    assert _hashes_registrados() - antes == 50


def test_mine_cpu_cuenta_los_hashes_hasta_el_nonce_ganador(worker_cpu):
    esperado = next(
        n for n in range(0, 10_000)
        if hashlib.md5(f"test{n}".encode()).hexdigest().startswith("0")
    )
    antes = _hashes_registrados()

    worker_cpu.mine_cpu("test", "0", 0, 10_000)

    # Corta al encontrarlo: cuenta desde start hasta el ganador inclusive.
    assert _hashes_registrados() - antes == esperado + 1


def test_mine_cpu_propaga_excepciones(worker_cpu):
    """Regresion: un error de minado NO debe verse como 'no hay solucion'."""
    # data=None hace fallar `data + str(nonce)` con TypeError en la primera
    # iteracion. Con el try/except viejo esto devolvia (None, None) en silencio.
    with pytest.raises(TypeError):
        worker_cpu.mine_cpu(None, "0", 0, 10)


def test_mine_cpu_registra_hashes_aunque_falle(worker_cpu):
    """El `finally` tiene que correr igual cuando la excepcion se propaga."""
    antes = _hashes_registrados()

    with pytest.raises(TypeError):
        worker_cpu.mine_cpu(None, "0", 0, 10)

    # Falla antes del primer `hashes += 1`, asi que suma 0 — lo que importa es
    # que la metrica siga consistente y no se pierda el incremento acumulado.
    assert _hashes_registrados() - antes == 0
