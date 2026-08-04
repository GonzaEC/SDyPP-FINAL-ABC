"""Tests de verificacion de Proof of Work de nct.py:
verify_hash (MD5 + dificultad) y validate_block (integridad de la cadena).

Solo dependen de la logica pura, no de Redis.
"""
import hashlib

import pytest


@pytest.fixture()
def nct(redis_client):
    import nct as nct_module
    return nct_module


def _md5(text):
    return hashlib.md5(text.encode()).hexdigest()


class TestVerifyHash:
    def test_acepta_hash_correcto_con_dificultad(self, nct):
        # Buscamos un nonce que produzca un hash que arranque con "0", para
        # probar el caso feliz con dificultad real.
        data, difficulty = "hola-bloque", "0"
        nonce = None
        for candidate in range(1, 20_000):
            if _md5(data + str(candidate)).startswith("0"):
                nonce = candidate
                break
        assert nonce is not None, "no se encontró nonce con hash empezando en '0'"
        h = _md5(data + str(nonce))
        assert h.startswith("0")
        assert nct.verify_hash(data, nonce, h, difficulty) is True

    def test_rechaza_hash_que_no_cumple_dificultad(self, nct):
        # busca un nonce cuyo hash NO empiece con "00"
        data, difficulty = "bloque", "00"
        h = _md5(data + "1")
        assert nct.verify_hash(data, 1, h, difficulty) is False or not h.startswith("00")
        # garantizamos un caso real probando varios nonces
        found_bad = False
        for nonce in range(1, 5000):
            h = _md5(data + str(nonce))
            if not h.startswith("00"):
                assert nct.verify_hash(data, nonce, h, "00") is False
                found_bad = True
                break
        assert found_bad, "no se encontro un hash que no arranque con 00 en 5000 nonces"

    def test_rechaza_hash_reportado_que_no_coincide(self, nct):
        # hash que no corresponde al data+nonce
        data, nonce, difficulty = "bloque", 42, "0"
        h = _md5("otra-cosa" + "42")
        assert nct.verify_hash(data, nonce, h, difficulty) is False

    def test_mismo_nonce_recalcula_igual(self, nct):
        # el mismo desafio siempre produce el mismo hash
        data, nonce, difficulty = "x", 999, ""
        h1 = _md5(data + str(nonce))
        assert nct.verify_hash(data, nonce, h1, difficulty) is True


class TestValidateBlock:
    def test_acepta_bloque_completo_y_cadena_correcta(self, nct):
        b1 = {
            "index": 0, "timestamp": 1.0, "transactions": [],
            "previous_hash": "0", "nonce": 0, "block_hash": _md5("<genesis>"),
        }
        assert nct.validate_block(b1, "0") is True

    def test_rechaza_previous_hash_incoherente(self, nct):
        b2 = {
            "index": 1, "timestamp": 1.0, "transactions": [],
            "previous_hash": "111", "nonce": 5, "block_hash": "abc",
        }
        assert nct.validate_block(b2, "222") is False

    def test_rechaza_bloque_sin_campos_requeridos(self, nct):
        incompleto = {"index": 1, "previous_hash": "0"}
        assert nct.validate_block(incompleto, "0") is False

    def test_encadenado_correcto(self, nct):
        prev = {
            "index": 0, "timestamp": 1.0, "transactions": [],
            "previous_hash": "0", "nonce": 0, "block_hash": _md5("<g>"),
        }
        cur = {
            "index": 1, "timestamp": 2.0, "transactions": [],
            "previous_hash": prev["block_hash"], "nonce": 7, "block_hash": _md5("<b>"),
        }
        assert nct.validate_block(cur, prev["block_hash"]) is True
        assert nct.validate_block(cur, "0") is False
