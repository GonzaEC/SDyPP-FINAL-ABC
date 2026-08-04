"""Tests de ownership de tickets en nct.py:
set_ticket_owner, apply_confirmed_tx (mint y transfer), y la defensa contra
doble-gasto (not_current_owner_at_apply).

Se corre contra un FakeRedis en memoria (conftest).
"""
import pytest


@pytest.fixture()
def nct(redis_client):
    import nct as nct_module
    nct_module.r = redis_client
    return nct_module


class TestSetTicketOwner:
    def test_asigna_dueño_inicial(self, nct, redis_client):
        nct.set_ticket_owner("evt:1", "pubA", "evt")
        assert redis_client.get("ticket_owner:evt:1") == "pubA"
        assert "evt:1" in redis_client.smembers("owner_tickets:pubA")
        assert "evt:1" in redis_client.smembers("tickets_by_event:evt")

    def test_transfiere_y_limpia_al_anterior(self, nct, redis_client):
        nct.set_ticket_owner("evt:1", "pubA", "evt")
        nct.set_ticket_owner("evt:1", "pubB", "evt")
        assert redis_client.get("ticket_owner:evt:1") == "pubB"
        assert "evt:1" not in redis_client.smembers("owner_tickets:pubA")
        assert "evt:1" in redis_client.smembers("owner_tickets:pubB")


class TestApplyMint:
    def test_mint_materializa_n_tickets(self, nct, redis_client):
        tx = {
            "op_id": "op-mint-1",
            "tx_type": "mint",
            "event_id": "evt",
            "to_pubkey": "pubOrg",
            "ticket_count": "3",
        }
        nct.apply_confirmed_tx(tx, block_index=1, confirmed_at=100.0)
        for i in (1, 2, 3):
            assert redis_client.get(f"ticket_owner:evt:{i}") == "pubOrg"
        # la op queda CONFIRMED
        op = redis_client.hgetall("op:op-mint-1")
        assert op["status"] == "CONFIRMED"
        assert int(op["block_index"]) == 1


class TestApplyTransfer:
    def test_transferencia_valida_cambia_dueño(self, nct, redis_client):
        nct.set_ticket_owner("evt:1", "pubA", "evt")
        tx = {
            "op_id": "op-tx-1",
            "tx_type": "transfer",
            "ticket_id": "evt:1",
            "from_pubkey": "pubA",
            "to_pubkey": "pubB",
            "event_id": "evt",
        }
        nct.apply_confirmed_tx(tx, block_index=2, confirmed_at=200.0)
        assert redis_client.get("ticket_owner:evt:1") == "pubB"
        assert "evt:1" not in redis_client.smembers("owner_tickets:pubA")
        assert "evt:1" in redis_client.smembers("owner_tickets:pubB")

    def test_doble_gasto_es_rechazado_al_aplicar(self, nct, redis_client):
        # Dos transferencias del MISMO ticket entraron mientras seguía siendo de
        # pubA (ambas pasaron el chequeo de POST /tx/transfer). Al aplicarse la
        # primera, el dueño pasa a pubB. La segunda, al aplicarse, debe fallar
        # con not_current_owner_at_apply y NO pisar al dueño legítimo.
        nct.set_ticket_owner("evt:1", "pubA", "evt")
        tx1 = {
            "op_id": "op-tx-winner",
            "tx_type": "transfer",
            "ticket_id": "evt:1",
            "from_pubkey": "pubA",
            "to_pubkey": "pubB",
            "event_id": "evt",
        }
        tx2 = {
            "op_id": "op-tx-loser",
            "tx_type": "transfer",
            "ticket_id": "evt:1",
            "from_pubkey": "pubA",
            "to_pubkey": "pubC",
            "event_id": "evt",
        }
        nct.apply_confirmed_tx(tx1, block_index=2, confirmed_at=200.0)
        nct.apply_confirmed_tx(tx2, block_index=3, confirmed_at=300.0)

        # el dueño legítimo sigue siendo pubB
        assert redis_client.get("ticket_owner:evt:1") == "pubB"
        # la perdedora quedó FAILED con el código esperado
        op = redis_client.hgetall("op:op-tx-loser")
        assert op["status"] == "FAILED"
        assert op["error_code"] == "not_current_owner_at_apply"
        # la ganadora quedó CONFIRMED
        op_winner = redis_client.hgetall("op:op-tx-winner")
        assert op_winner["status"] == "CONFIRMED"
        # nadie le asignó el ticket a pubC
        assert "evt:1" not in redis_client.smembers("owner_tickets:pubC")

    def test_transferencia_sin_op_id_no_hace_nada(self, nct, redis_client):
        # tx legacy (formato sender/receiver/amount) no toca ownership
        tx = {"tx_type": "transfer", "ticket_id": "evt:1", "from_pubkey": "pubA", "to_pubkey": "pubB"}
        nct.apply_confirmed_tx(tx, block_index=1, confirmed_at=1.0)
        assert redis_client.get("ticket_owner:evt:1") is None
