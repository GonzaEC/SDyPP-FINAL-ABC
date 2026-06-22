# ADR-021: Persistencia de Redis con AOF para la blockchain

**Estado:** Accepted
**Fecha:** 2026-06-22

## Contexto

La blockchain se almacena en Redis (lista `blockchain`, hashes `block:N`, índices de ownership).
Sin persistencia, un reinicio del pod de Redis borra toda la cadena — incluyendo bloques minados,
tickets emitidos y el ownership de entradas. Esto contradice la propiedad fundamental de
inmutabilidad de una blockchain.

Durante el despliegue detectamos que Redis se reinició y la cadena se perdió completamente.

## Decisión

Habilitamos **AOF (Append Only File)** y **snapshots RDB** en Redis:

```yaml
command: ["redis-server", "--appendonly", "yes", "--save", "60", "1"]
```

- `--appendonly yes`: cada escritura se persiste a disco inmediatamente (AOF).
- `--save 60 1`: snapshot RDB cada 60 segundos si hubo al menos 1 cambio (backup adicional).

Los datos se escriben en `/data`, que está respaldado por un PVC de 1 GiB (`redis-pvc`).

## Consecuencias

### Positivas
- La blockchain sobrevive reinicios de Redis, del pod, o del nodo completo.
- El ownership de tickets y las operaciones pendientes no se pierden.
- Consistente con la promesa de inmutabilidad de la blockchain.

### Negativas
- Leve overhead de I/O por el AOF (despreciable para nuestro volumen).
- El PVC de 1 GiB limita la cantidad de datos; suficiente para el TP.

## Alternativas consideradas

### A. Dejar Redis sin persistencia (status quo)
Inaceptable: la blockchain se pierde en cada reinicio.

### B. Persistir la cadena en Postgres desde el NCT
Requiere cambiar el NCT (código del otro equipo) para usar Postgres. Más invasivo.
