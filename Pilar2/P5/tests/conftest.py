"""Fixtures para testear nct.py sin Redis ni RabbitMQ reales.

Importar nct.py dispara en top-level: Obs -> connect_redis() (loop infinito hasta
conectar) y connect_rabbitmq() (idem). Para poder cargar el modulo en un test
sin infra, inyectamos FAKES de los modulos `redis` y `pika` en sys.modules
ANTES del import, con una implementacion en memoria que responde a los
metodos que nct.py usa.

Ademas, `observability` importa modulos de OpenTelemetry de forma tolerante a
fallo (degradan a no-op si faltan), asi que no hace falta mockearlo.
"""
import sys
import os
import types
import time
import threading

import pytest

# nct.py hace `import observability`, que debe resolver al observability.py de
# Pilar2/P5 (mismo directorio), no a cualquier otro `observability` del path.
_P5_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if _P5_DIR not in sys.path:
    sys.path.insert(0, _P5_DIR)


class FakeRedis:
    """Redis en memoria suficiente para nct.py (List/Hash/Set/String)."""

    def __init__(self):
        self.strings = {}
        self.lists = {}
        self.sets = {}
        self.hashes = {}

    # -- string commands -----------------------------------------------------
    def get(self, key):
        return self.strings.get(key)

    def set(self, key, value):
        self.strings[key] = value
        return True

    def setex(self, key, seconds, value):
        self.strings[key] = value
        return True

    def exists(self, key):
        return key in self.strings or key in self.lists or key in self.sets or key in self.hashes

    def delete(self, *keys):
        removed = 0
        for k in keys:
            for store in (self.strings, self.lists, self.sets, self.hashes):
                if k in store:
                    del store[k]
                    removed += 1
        return removed

    # -- list commands -------------------------------------------------------
    def rpush(self, key, *values):
        self.lists.setdefault(key, []).extend(values)
        return len(self.lists[key])

    def llen(self, key):
        return len(self.lists.get(key, []))

    def lrange(self, key, start, end):
        items = self.lists.get(key, [])
        if end == -1:
            end = len(items) - 1
        return items[start:end + 1]

    def lindex(self, key, index):
        items = self.lists.get(key, [])
        if -len(items) <= index < len(items):
            return items[index]
        return None

    def ltrim(self, key, start, end):
        items = self.lists.get(key, [])
        self.lists[key] = items[start:end + 1]
        return True

    # -- set commands --------------------------------------------------------
    def sadd(self, key, *values):
        self.sets.setdefault(key, set()).update(values)
        return len(values)

    def srem(self, key, *values):
        s = self.sets.get(key, set())
        before = len(s)
        s.difference_update(values)
        self.sets[key] = s
        return before - len(s)

    def smembers(self, key):
        return self.sets.get(key, set())

    # -- hash commands -------------------------------------------------------
    def hset(self, key, mapping=None, **kwargs):
        self.hashes.setdefault(key, {})
        if mapping:
            self.hashes[key].update({k: str(v) for k, v in mapping.items()})
        if kwargs:
            self.hashes[key].update({k: str(v) for k, v in kwargs.items()})
        return len(self.hashes[key])

    def hgetall(self, key):
        return dict(self.hashes.get(key, {}))


def _install_fake_redis_module(instance=None):
    """Crea un modulo `redis` falso y lo mete en sys.modules."""
    instance = instance or FakeRedis()

    class _RedisClass:
        def __init__(self, *args, **kwargs):
            pass

        def ping(self):
            return True

        # Delegamos todos los metodos de comando a la instancia compartida.
        def __getattr__(self, name):
            return getattr(instance, name)

    mod = types.ModuleType("redis")
    mod.Redis = _RedisClass
    sys.modules["redis"] = mod
    return instance


def _install_fake_pika_module():
    """Crea un modulo `pika` falso suficiente para el top-level de nct.py."""
    class _SSLOptions:
        def __init__(self, *a, **k):
            pass

    class _ConnectionParameters:
        def __init__(self, *a, **k):
            pass

    class _Channel:
        def queue_declare(self, *a, **k):
            return None

        def basic_qos(self, *a, **k):
            return None

        def add_on_return_callback(self, *a, **k):
            return None

        def basic_publish(self, *a, **k):
            return None

        def basic_get(self, queue="", **k):
            return None, None, None

        def basic_ack(self, *a, **k):
            return None

        def basic_nack(self, *a, **k):
            return None

    class _Connection:
        def __init__(self, *a, **k):
            pass

        def channel(self):
            return _Channel()

        def close(self):
            return None

    class _BlockingConnection(_Connection):
        def sleep(self, duration):
            time.sleep(duration)

    mod = types.ModuleType("pika")
    mod.SSLOptions = _SSLOptions
    mod.ConnectionParameters = _ConnectionParameters
    mod.BlockingConnection = _BlockingConnection
    mod.exceptions = types.ModuleType("pika.exceptions")
    sys.modules["pika"] = mod
    sys.modules["pika.exceptions"] = mod.exceptions


@pytest.fixture(scope="session")
def _fakes_installed():
    """Instala los fakes de redis/pika una sola vez y deja el shared instance."""
    _install_fake_redis_module()
    _install_fake_pika_module()
    return None


@pytest.fixture()
def redis_client(_fakes_installed):
    """Nueva instancia de FakeRedis por test, para aislar el estado."""
    return FakeRedis()


@pytest.fixture()
def nct(_fakes_installed):
    """Importa nct.py con los fakes instalados y sustituye su `r` global."""
    import Pilar2.P5.nct as nct_module
    fresh = FakeRedis()
    nct_module.r = fresh
    # Tambien apuntamos la instancia compartida del fake (por si alguna
    # funcion tocó el global antes).
    return nct_module, fresh