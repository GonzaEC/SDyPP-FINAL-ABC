"""Tests de verificación de firma ECDSA de nct.py (server-side Python)
y de paridad del canonicalize con el lado TS (app/src/lib/crypto/common.ts).

El objetivo es cubrir la verificación real que hace el NCT en /tx/mint y
/tx/transfer (reason=validation).
"""
import base64

import pytest
from cryptography.hazmat.primitives.asymmetric import ec
from cryptography.hazmat.primitives import hashes, serialization
from cryptography.hazmat.primitives.asymmetric.utils import decode_dss_signature


@pytest.fixture()
def nct(redis_client):
    import nct as nct_module
    return nct_module


def _sign_p1363(priv, message_bytes):
    """Firma SHA-256/ECDSA P-256 y devuelve la firma en IEEE P1363 (r||s)."""
    der_sig = priv.sign(message_bytes, ec.ECDSA(hashes.SHA256()))
    r, s = decode_dss_signature(der_sig)
    return r.to_bytes(32, "big") + s.to_bytes(32, "big")


def _spki_b64(pub):
    der = pub.public_bytes(
        encoding=serialization.Encoding.DER,
        format=serialization.PublicFormat.SubjectPublicKeyInfo,
    )
    return base64.b64encode(der).decode()


@pytest.fixture()
def signer(nct):
    """Devuelve (pub_b64, firma_b64) para firmar a traves de canonicalize."""
    priv = ec.generate_private_key(ec.SECP256R1())
    pub_b64 = _spki_b64(priv.public_key())

    def do_sign(payload):
        msg = nct.canonicalize(payload).encode("utf-8")
        sig = _sign_p1363(priv, msg)
        return pub_b64, base64.b64encode(sig).decode()

    return do_sign


class TestCanonicalize:
    def test_keys_ordenadas_alfabeticamente(self, nct):
        payload = {"ticketCount": 10, "eventId": "e1", "type": "mint_batch"}
        out = nct.canonicalize(payload)
        # el canonicalize ordena las keys
        x, y, z = out.index("eventId"), out.index("ticketCount"), out.index("type")
        assert x < y < z

    def test_es_deterministico(self, nct):
        p1 = {"b": 2, "a": {"x": 1, "z": 3, "y": 2}}
        assert nct.canonicalize(p1) == nct.canonicalize(p1)

    def test_sin_espacios(self, nct):
        assert nct.canonicalize({"a": 1, "b": "x"}) == '{"a":1,"b":"x"}'


class TestVerifySignature:
    def test_acepta_firma_valida(self, nct, signer):
        payload = {"type": "mint_batch", "eventId": "evt_1", "organizerPublicKey": "k", "ticketCount": 10}
        pub_b64, sig_b64 = signer(payload)
        assert nct.verify_signature(pub_b64, payload, sig_b64) is True

    def test_rechaza_payload_manipulado(self, nct, signer):
        payload = {"type": "mint_batch", "eventId": "evt_1", "organizerPublicKey": "k", "ticketCount": 10}
        pub_b64, sig_b64 = signer(payload)
        tampered = dict(payload, ticketCount=11)
        assert nct.verify_signature(pub_b64, tampered, sig_b64) is False

    def test_rechaza_firma_de_otra_clave(self, nct, signer):
        payload = {"type": "transfer", "ticketId": "t1", "toPubkey": "bob"}
        pub_b64, sig_b64 = signer(payload)
        other = ec.generate_private_key(ec.SECP256R1())
        other_b64 = _spki_b64(other.public_key())
        assert nct.verify_signature(other_b64, payload, sig_b64) is False

    def test_rechaza_firma_por_doble_uso(self, nct, signer):
        payload = {"a": 1}
        pub_b64, sig_b64 = signer(payload)
        other_payload = {"a": 1, "b": 2}
        # la firma se hizo sobre {"a":1}, verificar contra otra cosa falla
        assert nct.verify_signature(pub_b64, other_payload, sig_b64) is False

    def test_rechaza_input_malformado(self, nct):
        assert nct.verify_signature("no-base64!!", {"a": 1}, "corto") is False
        assert nct.verify_signature("", {"a": 1}, "") is False